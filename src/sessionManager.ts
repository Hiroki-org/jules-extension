import * as vscode from "vscode";
import { Session, SessionState, PRStatusCache } from './types';
import { JULES_API_BASE_URL } from './constants';
import { JulesApiClient } from "./julesApiClient";

// GitHub PR status cache to avoid excessive API calls
const prStatusCache: PRStatusCache = {};
const PR_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export function clearPrStatusCache(): void {
    Object.keys(prStatusCache).forEach((key) => delete prStatusCache[key]);
}

let previousSessionStates: Map<string, SessionState> = new Map();

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

export function getPreviousSessionStates(): Map<string, SessionState> {
    return previousSessionStates;
}

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
            return "RUNNING"; // default to RUNNING
    }
}

export function extractPRUrl(sessionOrState: Session | SessionState): string | null {
    return (
        sessionOrState.outputs?.find((o) => o.pullRequest)?.pullRequest?.url || null
    );
}

async function checkPRStatus(
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

export function checkForPlansAwaitingApproval(currentSessions: Session[]): Session[] {
    const sessionsAwaitingApproval: Session[] = [];
    for (const session of currentSessions) {
        const prevState = previousSessionStates.get(session.name);
        if (prevState?.isTerminated) {
            continue; // Skip terminated sessions
        }
        if (
            session.rawState === "AWAITING_PLAN_APPROVAL" &&
            (!prevState || prevState.rawState !== "AWAITING_PLAN_APPROVAL")
        ) {
            sessionsAwaitingApproval.push(session);
        }
    }
    return sessionsAwaitingApproval;
}

export async function notifyPRCreated(session: Session, prUrl: string): Promise<void> {
    const result = await vscode.window.showInformationMessage(
        `Session "${session.title}" has completed and created a PR!`,
        "Open PR"
    );
    if (result === "Open PR") {
        vscode.env.openExternal(vscode.Uri.parse(prUrl));
    }
}

export async function notifyPlanAwaitingApproval(
    session: Session,
    context: vscode.ExtensionContext
): Promise<void> {
    const selection = await vscode.window.showInformationMessage(
        `Jules has a plan ready for your approval in session: "${session.title}"`,
        "Approve Plan",
        "View Details"
    );

    if (selection === "Approve Plan") {
        await approvePlan(session.name, context);
    } else if (selection === "View Details") {
        await vscode.commands.executeCommand(
            "jules-extension.showActivities",
            session.name
        );
    }
}

export async function updatePreviousStates(
    currentSessions: Session[],
    context: vscode.ExtensionContext
): Promise<void> {
    for (const session of currentSessions) {
        const prevState = previousSessionStates.get(session.name);

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
                }
            }
        } else if (session.state === "FAILED" || session.state === "CANCELLED") {
            isTerminated = true;
            console.log(
                `Jules: Session ${session.name} is now terminated due to its state: ${session.state}.`
            );
        }

        previousSessionStates.set(session.name, {
            name: session.name,
            state: session.state,
            rawState: session.rawState,
            outputs: session.outputs,
            isTerminated: isTerminated,
        });
    }

    await context.globalState.update(
        "jules.previousSessionStates",
        Object.fromEntries(previousSessionStates)
    );
    console.log(
        `Jules: Saved ${previousSessionStates.size} session states to global state.`
    );
}

export async function approvePlan(
    sessionId: string,
    context: vscode.ExtensionContext
): Promise<void> {
    const apiKey = await context.secrets.get("jules-api-key");
    if (!apiKey) {
        vscode.window.showErrorMessage("API Key is not set. Please set it first.");
        return;
    }

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Approving plan...",
            },
            async () => {
                const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);
                await apiClient.approvePlan(sessionId);

                vscode.window.showInformationMessage("Plan approved successfully!");

                await vscode.commands.executeCommand("jules-extension.refreshSessions");
            }
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred.";
        vscode.window.showErrorMessage(`Error approving plan: ${message}`);
    }
}
