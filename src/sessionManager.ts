import * as vscode from 'vscode';
import {
    Session,
    SessionState,
    SessionOutput,
    Plan,
    ActivitiesResponse,
    PlanStep,
    PRStatusCache
} from './types';
import {
    JULES_API_BASE_URL,
    VIEW_DETAILS_ACTION,
    SHOW_ACTIVITIES_COMMAND,
    MAX_PLAN_STEPS_IN_NOTIFICATION,
    MAX_PLAN_STEP_LENGTH,
    SESSION_STATE,
    PR_CACHE_DURATION
} from './constants';
import { fetchWithTimeout } from './fetchUtils';
import { GitHubAuth } from './githubAuth';
import { logChannel } from './logger';

export let prStatusCache: PRStatusCache = {};

export let previousSessionStates: Map<string, SessionState> = new Map();
export let notifiedSessions: Set<string> = new Set();

export function setPrStatusCache(cache: PRStatusCache) {
    prStatusCache = cache;
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

export async function getStoredApiKey(
    context: vscode.ExtensionContext
): Promise<string | undefined> {
    const apiKey = await context.secrets.get("jules-api-key");
    if (!apiKey) {
        vscode.window.showErrorMessage(
            'API Key not found. Please set it first using "Set Jules API Key" command.'
        );
        return undefined;
    }
    return apiKey;
}

export async function getGitHubUrl(): Promise<string | undefined> {
    try {
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            throw new Error('Git extension not found');
        }
        const git = gitExtension.exports.getAPI(1);
        const repository = git.repositories[0];
        if (!repository) {
            throw new Error('No Git repository found');
        }
        const remote = repository.state.remotes.find(
            (r: { name: string; fetchUrl?: string; pushUrl?: string }) => r.name === 'origin'
        );
        if (!remote) {
            throw new Error('No origin remote found');
        }
        return remote.fetchUrl || remote.pushUrl;
    } catch (error) {
        console.error('Failed to get GitHub URL:', error);
        return undefined;
    }
}

export function resolveSessionId(
    context: vscode.ExtensionContext,
    target?: any | string // Use 'any' to avoid importing SessionTreeItem for now
): string | undefined {
    // If target has a session property with a name, use it (duck typing for SessionTreeItem)
    const targetName = (target && typeof target === 'object' && 'session' in target) ? target.session.name : undefined;

    return (
        (typeof target === "string" ? target : undefined) ??
        targetName ??
        context.globalState.get<string>("active-session-id")
    );
}

export function extractPRUrl(sessionOrState: Session | SessionState): string | null {
    return (
        sessionOrState.outputs?.find((o) => o.pullRequest)?.pullRequest?.url || null
    );
}

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

        // Prefer OAuth token, fallback to manually set PAT
        let token = await GitHubAuth.getToken();
        if (!token) {
            token = await context.secrets.get("jules-github-token");
            if (token) {
                console.log("[Jules] Using fallback GitHub PAT for PR status check.");
            }
        }

        const headers: Record<string, string> = {
            Accept: "application/vnd.github.v3+json",
        };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetchWithTimeout(apiUrl, { headers });

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

export function checkForSessionsInState(
    currentSessions: Session[],
    targetState: string
): Session[] {
    return currentSessions.filter((session) => {
        const prevState = previousSessionStates.get(session.name);
        const isNotTerminated = !prevState?.isTerminated;
        const isTargetState = session.rawState === targetState;
        const isStateChanged = !prevState || prevState.rawState !== targetState;
        const willNotify = isNotTerminated && isTargetState && isStateChanged;
        if (isTargetState) {
            logChannel.appendLine(`Jules: Debug - Session ${session.name}: terminated=${!isNotTerminated}, rawState=${session.rawState}, prevRawState=${prevState?.rawState}, willNotify=${willNotify}`);
        }
        return willNotify;
    });
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

export async function fetchPlanFromActivities(
    sessionId: string,
    apiKey: string
): Promise<Plan | null> {
    try {
        const response = await fetchWithTimeout(
            `${JULES_API_BASE_URL}/${sessionId}/activities`,
            {
                method: "GET",
                headers: {
                    "X-Goog-Api-Key": apiKey,
                    "Content-Type": "application/json",
                },
            }
        );

        if (!response.ok) {
            console.log(`Jules: Failed to fetch activities for plan: ${response.status}`);
            return null;
        }

        const data = (await response.json()) as ActivitiesResponse;
        if (!data.activities || !Array.isArray(data.activities)) {
            return null;
        }

        // Find the most recent planGenerated activity (reverse to get latest first)
        const planActivity = [...data.activities].reverse().find((a) => a.planGenerated);
        return planActivity?.planGenerated?.plan || null;
    } catch (error) {
        console.error(`Jules: Error fetching plan from activities: ${error}`);
        return null;
    }
}

export function formatPlanForNotification(plan: Plan): string {
    const parts: string[] = [];
    if (plan.title) {
        parts.push(`📋 ${plan.title}`);
    }
    if (plan.steps && plan.steps.length > 0) {
        const stepsPreview = plan.steps
            .filter((step): step is PlanStep => !!step)
            .slice(0, MAX_PLAN_STEPS_IN_NOTIFICATION);
        stepsPreview.forEach((step, index) => {
            const stepDescription = step?.description || '';
            // Truncate long steps for notification display
            const truncatedStep = stepDescription.length > MAX_PLAN_STEP_LENGTH
                ? stepDescription.substring(0, MAX_PLAN_STEP_LENGTH - 3) + '...'
                : stepDescription;
            parts.push(`${index + 1}. ${truncatedStep}`);
        });
        if (plan.steps.length > MAX_PLAN_STEPS_IN_NOTIFICATION) {
            parts.push(`... and ${plan.steps.length - MAX_PLAN_STEPS_IN_NOTIFICATION} more steps`);
        }
    }
    return parts.join('\n');
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
        const response = await fetchWithTimeout(
          `${JULES_API_BASE_URL}/${sessionId}:approvePlan`,
          {
            method: "POST",
            headers: {
              "X-Goog-Api-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to approve plan: ${response.status} ${response.statusText}`
          );
        }

        vscode.window.showInformationMessage("Plan approved successfully!");

        // リフレッシュして最新状態を取得
        await vscode.commands.executeCommand("jules-extension.refreshSessions");
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred.";
    vscode.window.showErrorMessage(`Error approving plan: ${message}`);
  }
}

export async function notifyPlanAwaitingApproval(
    session: Session,
    context: vscode.ExtensionContext
): Promise<void> {
    // Fetch plan details from activities
    const apiKey = await context.secrets.get("jules-api-key");
    let planDetails = '';

    if (apiKey) {
        const plan = await fetchPlanFromActivities(session.name, apiKey);
        if (plan) {
            planDetails = formatPlanForNotification(plan);
        }
    }

    // Build notification message with plan content
    let message = `Jules has a plan ready for your approval in session: "${session.title}"`;
    if (planDetails) {
        message += `\n\n${planDetails}`;
    }

    const selection = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        "Approve Plan",
        VIEW_DETAILS_ACTION
    );

    if (selection === "Approve Plan") {
        await approvePlan(session.name, context);
    } else if (selection === VIEW_DETAILS_ACTION) {
        await vscode.commands.executeCommand(
            SHOW_ACTIVITIES_COMMAND,
            session.name
        );
    }
}

export async function notifyUserFeedbackRequired(session: Session): Promise<void> {
    const selection = await vscode.window.showInformationMessage(
        `Jules is waiting for your feedback in session: "${session.title}"`,
        VIEW_DETAILS_ACTION
    );

    if (selection === VIEW_DETAILS_ACTION) {
        await vscode.commands.executeCommand(
            SHOW_ACTIVITIES_COMMAND,
            session.name
        );
    }
}

export function areOutputsEqual(a?: SessionOutput[], b?: SessionOutput[]): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b || a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        const prA = a[i]?.pullRequest;
        const prB = b[i]?.pullRequest;

        if (
            prA?.url !== prB?.url ||
            prA?.title !== prB?.title ||
            prA?.description !== prB?.description
        ) {
            return false;
        }
    }
    return true;
}

export async function updatePreviousStates(
    currentSessions: Session[],
    context: vscode.ExtensionContext
): Promise<void> {
    let hasChanged = false;

    // 1. Identify sessions that require PR status checks
    // We only check for sessions that are COMPLETED, have a PR URL, and are NOT already terminated.
    const sessionsToCheck = currentSessions.filter(session => {
        const prevState = previousSessionStates.get(session.name);
        if (prevState?.isTerminated) { return false; }
        return session.state === "COMPLETED" && extractPRUrl(session);
    });

    // 2. Perform checks in parallel
    // This avoids sequential API calls (N+1 problem) when multiple sessions are completed.
    const prStatusMap = new Map<string, boolean>();

    if (sessionsToCheck.length > 0) {
        await Promise.all(sessionsToCheck.map(async (session) => {
            const prUrl = extractPRUrl(session);
            // The `if (prUrl)` check is redundant because `sessionsToCheck` is already filtered.
            // `prUrl` is guaranteed to be non-null here.
            const isClosed = await checkPRStatus(prUrl!, context);
            prStatusMap.set(session.name, isClosed);
        }));
    }

    for (const session of currentSessions) {
        const prevState = previousSessionStates.get(session.name);

        // If already terminated, we don't need to check again.
        // Just update with the latest info from the server but keep it terminated.
        if (prevState?.isTerminated) {
            if (
                prevState.state !== session.state ||
                prevState.rawState !== session.rawState ||
                !areOutputsEqual(prevState.outputs, session.outputs)
            ) {
                previousSessionStates.set(session.name, {
                    ...prevState,
                    state: session.state,
                    rawState: session.rawState,
                    outputs: session.outputs,
                });
                hasChanged = true;
            }
            continue;
        }

        let isTerminated = false;
        if (session.state === "COMPLETED") {
            const prUrl = extractPRUrl(session);
            if (prUrl) {
                // Use pre-fetched status
                const isClosed = prStatusMap.get(session.name) ?? false;
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

        // Check if state actually changed before updating map
        if (
            !prevState ||
            prevState.state !== session.state ||
            prevState.rawState !== session.rawState ||
            prevState.isTerminated !== isTerminated ||
            !areOutputsEqual(prevState.outputs, session.outputs)
        ) {
            previousSessionStates.set(session.name, {
                name: session.name,
                state: session.state,
                rawState: session.rawState,
                outputs: session.outputs,
                isTerminated: isTerminated,
            });
            hasChanged = true;
        }
    }

    // Persist the updated states to global state ONLY if changed
    if (hasChanged) {
        await context.globalState.update(
            "jules.previousSessionStates",
            Object.fromEntries(previousSessionStates)
        );
        // Also persist PR status cache to save API calls on next reload
        await context.globalState.update("jules.prStatusCache", prStatusCache);

        console.log(
            `Jules: Saved ${previousSessionStates.size} session states to global state.`
        );
    }
}
