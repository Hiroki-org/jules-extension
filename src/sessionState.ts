import * as vscode from "vscode";
import { Session, SessionState, SessionOutput, PRStatusCache } from './types';

// Constants
export const SESSION_STATE = {
    AWAITING_PLAN_APPROVAL: "AWAITING_PLAN_APPROVAL",
    AWAITING_USER_FEEDBACK: "AWAITING_USER_FEEDBACK",
};

// PR status cache
const prStatusCache: PRStatusCache = {};
const PR_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Session state management
let previousSessionStates: Map<string, SessionState> = new Map();
let notifiedSessions: Set<string> = new Set();

/**
 * グローバルステートから前回のセッション状態を読み込む
 */
export function loadPreviousSessionStates(context: vscode.ExtensionContext): void {
    const storedStates = context.globalState.get<{ [key: string]: SessionState }>(
        "jules.previousSessionStates",
        {}
    );
    previousSessionStates = new Map(Object.entries(storedStates));
    console.log(
        `Jules: Loaded ${previousSessionStates.size} previous session states from global state.`
    );
}

/**
 * APIの状態をUIの状態にマッピングする
 */
export function mapApiStateToSessionState(
    apiState: string
): "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" {
    switch (apiState) {
        case "PLANNING":
        case "AWAITING_PLAN_APPROVAL":
        case "AWAITING_USER_FEEDBACK":
        case "IN_PROGRESS":
        case "QUEUED":
        case "STATE_UNSPECIFIED":
            return "RUNNING";
        case "COMPLETED":
            return "COMPLETED";
        case "FAILED":
            return "FAILED";
        case "PAUSED":
        case "CANCELLED":
            return "CANCELLED";
        default:
            return "RUNNING";
    }
}

/**
 * PRのURLをセッションから抽出する
 */
export function extractPRUrl(sessionOrState: Session | SessionState): string | null {
    return (
        sessionOrState.outputs?.find((o) => o.pullRequest)?.pullRequest?.url || null
    );
}

/**
 * PRのステータスをキャッシュ付きでチェックする
 */
export async function checkPRStatus(
    prUrl: string,
    context: vscode.ExtensionContext
): Promise<boolean> {
    // Check cache first
    const cached = prStatusCache[prUrl];
    const now = Date.now();
    if (cached && now - cached.lastChecked < PR_CACHE_DURATION) {
        return cached.isClosed;
    }

    try {
        // Parse GitHub PR URL: https://github.com/owner/repo/pull/123
        const match = prUrl.match(
            /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
        );
        if (!match) {
            console.log(`Jules: Invalid GitHub PR URL format: ${prUrl}`);
            return false;
        }

        const [, owner, repo, prNumber] = match;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

        // Get GitHub token if available
        const githubToken = await context.secrets.get("jules-github-token");
        const headers: Record<string, string> = {
            Accept: "application/vnd.github.v3+json",
        };
        if (githubToken) {
            headers.Authorization = `Bearer ${githubToken}`;
        }

        const response = await fetch(apiUrl, { headers });

        if (!response.ok) {
            console.log(
                `Jules: Failed to fetch PR status: ${response.status} ${response.statusText}`
            );
            return false;
        }

        const prData = (await response.json()) as { state: string };
        const isClosed = prData.state === "closed";

        // Update cache
        prStatusCache[prUrl] = {
            isClosed,
            lastChecked: now,
        };

        return isClosed;
    } catch (error) {
        console.error(`Jules: Error checking PR status for ${prUrl}:`, error);
        return false;
    }
}

/**
 * 完了したセッションをチェックする
 */
export function checkForCompletedSessions(currentSessions: Session[]): Session[] {
    const completedSessions: Session[] = [];
    for (const session of currentSessions) {
        const prevState = previousSessionStates.get(session.name);
        if (prevState?.isTerminated) {
            continue; // Skip terminated sessions
        }
        if (
            session.state === "COMPLETED" &&
            (!prevState || prevState.state !== "COMPLETED")
        ) {
            const prUrl = extractPRUrl(session);
            if (prUrl) {
                // Only count as a new completion if there's a PR URL.
                completedSessions.push(session);
            }
        }
    }
    return completedSessions;
}

/**
 * 特定の状態のセッションをチェックする
 */
export function checkForSessionsInState(
    currentSessions: Session[],
    targetState: string,
    logChannel?: vscode.OutputChannel
): Session[] {
    return currentSessions.filter((session) => {
        const prevState = previousSessionStates.get(session.name);
        const isNotTerminated = !prevState?.isTerminated;
        const isTargetState = session.rawState === targetState;
        const isStateChanged = !prevState || prevState.rawState !== targetState;
        const willNotify = isNotTerminated && isTargetState && isStateChanged;
        if (isTargetState && logChannel) {
            logChannel.appendLine(`Jules: Debug - Session ${session.name}: terminated=${!isNotTerminated}, rawState=${session.rawState}, prevRawState=${prevState?.rawState}, willNotify=${willNotify}`);
        }
        return willNotify;
    });
}

/**
 * 前回の状態を更新する
 */
export async function updatePreviousStates(
    currentSessions: Session[],
    context: vscode.ExtensionContext
): Promise<void> {
    for (const session of currentSessions) {
        const prevState = previousSessionStates.get(session.name);

        // If already terminated, we don't need to check again.
        // Just update with the latest info from the server but keep it terminated.
        if (prevState?.isTerminated) {
            previousSessionStates.set(session.name, {
                ...prevState,
                state: session.state,
                rawState: session.rawState,
                outputs: session.outputs,
            });
            continue;
        }

        let isTerminated = false;
        if (session.state === "COMPLETED") {
            const prUrl = extractPRUrl(session);
            if (prUrl) {
                const isClosed = await checkPRStatus(prUrl, context);
                if (isClosed) {
                    isTerminated = true;
                    console.log(
                        `Jules: Session ${session.name} is now terminated because its PR is closed.`
                    );
                    notifiedSessions.delete(session.name);
                }
            }
        } else if (session.state === "FAILED" || session.state === "CANCELLED") {
            isTerminated = true;
            console.log(
                `Jules: Session ${session.name} is now terminated due to its state: ${session.state}.`
            );
            notifiedSessions.delete(session.name);
        }

        previousSessionStates.set(session.name, {
            name: session.name,
            state: session.state,
            rawState: session.rawState,
            outputs: session.outputs,
            isTerminated: isTerminated,
        });
    }

    // Persist the updated states to global state
    await context.globalState.update(
        "jules.previousSessionStates",
        Object.fromEntries(previousSessionStates)
    );
    console.log(
        `Jules: Saved ${previousSessionStates.size} session states to global state.`
    );
}

/**
 * 前回のセッション状態を取得する
 */
export function getPreviousSessionStates(): Map<string, SessionState> {
    return previousSessionStates;
}

/**
 * 通知済みセッションを管理する
 */
export function getNotifiedSessions(): Set<string> {
    return notifiedSessions;
}

/**
 * セッションを通知済みに追加する
 */
export function addNotifiedSession(sessionName: string): void {
    notifiedSessions.add(sessionName);
}

/**
 * セッションを削除する
 */
export function deleteSessionState(sessionName: string): void {
    previousSessionStates.delete(sessionName);
    notifiedSessions.delete(sessionName);
}

/**
 * PRステータスキャッシュをクリアする
 */
export function clearPRStatusCache(): void {
    Object.keys(prStatusCache).forEach((key) => delete prStatusCache[key]);
}
