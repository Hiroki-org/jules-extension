import * as vscode from 'vscode';
import { Session, SessionState, SessionsResponse, Source as SourceType } from './types';
import { getStoredApiKey } from './utils';
import { JULES_API_BASE_URL } from './constants';
import { notifyPlanAwaitingApproval, notifyPRCreated } from './notifications';

const PR_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
export const prStatusCache: any = {};
export let previousSessionStates: Map<string, SessionState> = new Map();

function loadPreviousSessionStates(context: vscode.ExtensionContext): void {
    const storedStates = context.globalState.get<{ [key: string]: SessionState }>(
      "jules.previousSessionStates",
      {}
    );
    previousSessionStates = new Map(Object.entries(storedStates));
    console.log(
      `Jules: Loaded ${previousSessionStates.size} previous session states from global state.`
    );
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

function extractPRUrl(sessionOrState: Session | SessionState): string | null {
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

function checkForCompletedSessions(currentSessions: Session[]): Session[] {
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

function checkForPlansAwaitingApproval(currentSessions: Session[]): Session[] {
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

async function updatePreviousStates(
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

    // Persist the updated states to global state
    await context.globalState.update(
        "jules.previousSessionStates",
        Object.fromEntries(previousSessionStates)
    );
    console.log(
        `Jules: Saved ${previousSessionStates.size} session states to global state.`
    );
}

export class JulesSessionsProvider
    implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<
        vscode.TreeItem | undefined | null | void
    > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        vscode.TreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;

    private sessionsCache: Session[] = [];
    private isFetching = false;

    constructor(private context: vscode.ExtensionContext) {
        loadPreviousSessionStates(context);
     }

    private async fetchAndProcessSessions(
        isBackground: boolean = false
    ): Promise<void> {
        if (this.isFetching) {
            console.log("Jules: Fetch already in progress. Skipping.");
            return;
        }
        this.isFetching = true;
        console.log("Jules: Starting to fetch and process sessions...");

        try {
            const apiKey = await getStoredApiKey(this.context);
            if (!apiKey) {
                this.sessionsCache = [];
                return;
            }

            const response = await fetch(`${JULES_API_BASE_URL}/sessions`, {
                method: "GET",
                headers: {
                    "X-Goog-Api-Key": apiKey,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                const errorMsg = `Failed to fetch sessions: ${response.status} ${response.statusText}`;
                console.error(`Jules: ${errorMsg}`);
                if (!isBackground) {
                    vscode.window.showErrorMessage(errorMsg);
                }
                this.sessionsCache = [];
                return;
            }

            const data = (await response.json()) as SessionsResponse;
            if (!data.sessions || !Array.isArray(data.sessions)) {
                console.log("Jules: No sessions found or invalid response format");
                this.sessionsCache = [];
                return;
            }

            console.log(`Jules: Found ${data.sessions.length} total sessions`);

            const allSessionsMapped = data.sessions.map((session) => ({
                ...session,
                rawState: session.state,
                state: mapApiStateToSessionState(session.state),
            }));

            // --- Check for plans awaiting approval ---
            const plansAwaitingApproval =
                checkForPlansAwaitingApproval(allSessionsMapped);
            if (plansAwaitingApproval.length > 0) {
                console.log(
                    `Jules: Found ${plansAwaitingApproval.length} sessions awaiting plan approval`
                );
                for (const session of plansAwaitingApproval) {
                    notifyPlanAwaitingApproval(session, this.context).catch((error) => {
                        console.error(
                            "Jules: Failed to show plan approval notification",
                            error
                        );
                    });
                }
            }

            // --- Check for completed sessions (PR created) ---
            const completedSessions = checkForCompletedSessions(allSessionsMapped);
            if (completedSessions.length > 0) {
                console.log(
                    `Jules: Found ${completedSessions.length} completed sessions`
                );
                for (const session of completedSessions) {
                    const prUrl = extractPRUrl(session);
                    if (prUrl) {
                        notifyPRCreated(session, prUrl).catch((error) => {
                            console.error("Jules: Failed to show PR notification", error);
                        });
                    }
                }
            }

            // --- Update previous states after all checks ---
            await updatePreviousStates(allSessionsMapped, this.context);

            // --- Update the cache ---
            this.sessionsCache = allSessionsMapped;
        } catch (error) {
            console.error("Jules: Error during fetchAndProcessSessions:", error);
            this.sessionsCache = []; // Clear cache on error
        } finally {
            this.isFetching = false;
            console.log("Jules: Finished fetching and processing sessions.");
            // Fire the event to refresh the view with the new data
            this._onDidChangeTreeData.fire();
        }
    }

    async refresh(isBackground: boolean = false): Promise<void> {
        console.log(
            `Jules: refresh() called (isBackground: ${isBackground}), starting fetch.`
        );
        await this.fetchAndProcessSessions(isBackground);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            return [];
        }

        // If the cache is empty, it might be the first load.
        if (this.sessionsCache.length === 0 && !this.isFetching) {
            await this.fetchAndProcessSessions();
        }

        const selectedSource =
            this.context.globalState.get<SourceType>("selected-source");

        if (!selectedSource) {
            const item = new vscode.TreeItem(
                "ℹ️ No source selected. Click to select a source."
            );
            item.command = {
                command: "jules-extension.listSources",
                title: "Select Source",
            };
            item.contextValue = "no-source";
            return [item];
        }

        // Now, use the cache to build the tree
        let filteredSessions = this.sessionsCache.filter(
            (session) =>
                (session as any).sourceContext?.source === selectedSource.name
        );

        console.log(
            `Jules: Found ${filteredSessions.length} sessions for the selected source from cache`
        );

        // Filter out sessions with closed PRs if the setting is enabled
        const hideClosedPRs = vscode.workspace
            .getConfiguration("jules-extension")
            .get<boolean>("hideClosedPRSessions", true);

        if (hideClosedPRs) {
            // We no longer need to check PR status on every render.
            // The `isTerminated` flag in `previousSessionStates` handles this.
            const beforeFilterCount = filteredSessions.length;
            filteredSessions = filteredSessions.filter((session) => {
                const prevState = previousSessionStates.get(session.name);
                // Hide if the session is marked as terminated.
                return !prevState?.isTerminated;
            });
            const filteredCount = beforeFilterCount - filteredSessions.length;
            if (filteredCount > 0) {
                console.log(
                    `Jules: Filtered out ${filteredCount} terminated sessions (${beforeFilterCount} -> ${filteredSessions.length})`
                );
            }
        }

        if (filteredSessions.length === 0) {
            return [new vscode.TreeItem("No sessions found for this source.")];
        }

        return filteredSessions.map((session) => new SessionTreeItem(session));
    }
}

export class SessionTreeItem extends vscode.TreeItem {
    constructor(public readonly session: Session) {
        super(session.title || session.name, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${session.name} - ${session.state}${session.requirePlanApproval ? ' (Plan Approval Required)' : ''}`;
        this.description = session.state;
        this.iconPath = this.getIcon(session.state, session.rawState);
        this.contextValue = "jules-session";
        this.command = {
            command: "jules-extension.showActivities",
            title: "Show Activities",
            arguments: [session.name],
        };
    }

    private getIcon(state: string, rawState?: string): vscode.ThemeIcon {
        if (rawState === "AWAITING_PLAN_APPROVAL") {
            return new vscode.ThemeIcon("clock");
        }
        switch (state) {
            case "RUNNING":
                return new vscode.ThemeIcon("sync~spin");
            case "COMPLETED":
                return new vscode.ThemeIcon("check");
            case "FAILED":
                return new vscode.ThemeIcon("error");
            case "CANCELLED":
                return new vscode.ThemeIcon("close");
            default:
                return new vscode.ThemeIcon("question");
        }
    }
}
