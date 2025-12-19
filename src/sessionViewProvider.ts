import * as vscode from 'vscode';
import {
    Session,
    Source as SourceType,
    SessionsResponse
} from './types';
import {
    JULES_API_BASE_URL,
    SHOW_ACTIVITIES_COMMAND,
    SESSION_STATE
} from './constants';
import {
    getStoredApiKey,
    mapApiStateToSessionState,
    notifyPlanAwaitingApproval,
    notifyUserFeedbackRequired,
    checkForCompletedSessions,
    extractPRUrl,
    notifyPRCreated,
    updatePreviousStates,
    checkForSessionsInState,
    notifiedSessions,
    previousSessionStates
} from './sessionManager';
import { getBranchesForSession } from './branchUtils';
import { JulesApiClient } from './julesApiClient';
import { fetchWithTimeout } from './fetchUtils';
import { logChannel } from './logger';
import { sanitizeForLogging } from './securityUtils';

// Global flag to indicate if we are in a sensitive data fetching mode (like listing sources)
// which requires faster refresh rates.
// Ideally this should be managed better, but for now we export it to be mutable from commands.
export let isFetchingSensitiveData = false;

export function setIsFetchingSensitiveData(value: boolean) {
    isFetchingSensitiveData = value;
}

export class SessionTreeItem extends vscode.TreeItem {
    constructor(public readonly session: Session) {
        super(session.title || session.name, vscode.TreeItemCollapsibleState.None);

        const tooltip = new vscode.MarkdownString(`**${session.title || session.name}**`, true);
        tooltip.appendMarkdown(`\n\nStatus: **${session.state}**`);

        if (session.requirePlanApproval) {
            tooltip.appendMarkdown(`\n\n⚠️ **Plan Approval Required**`);
        }

        if (session.sourceContext?.source) {
            // Extract repo name if possible for cleaner display
            const source = session.sourceContext.source;
            if (typeof source === 'string') {
                const repoMatch = source.match(/sources\/github\/(.+)/);
                const repoName = repoMatch ? repoMatch[1] : source;
                tooltip.appendMarkdown(`\n\nSource: \`${repoName}\``);
            }
        }

        tooltip.appendMarkdown(`\n\nID: \`${session.name}\``);
        this.tooltip = tooltip;

        this.description = session.state;
        this.iconPath = this.getIcon(session.state, session.rawState);
        this.contextValue = "jules-session";
        if (session.url) {
            this.contextValue += " jules-session-with-url";
        }
        this.command = {
            command: SHOW_ACTIVITIES_COMMAND,
            title: "Show Activities",
            arguments: [session.name],
        };
    }

    private getIcon(state: string, rawState?: string): vscode.ThemeIcon {
        if (rawState === SESSION_STATE.AWAITING_PLAN_APPROVAL) {
            return new vscode.ThemeIcon("clock");
        }
        if (rawState === SESSION_STATE.AWAITING_USER_FEEDBACK) {
            return new vscode.ThemeIcon("comment-discussion");
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

export class JulesSessionsProvider
    implements vscode.TreeDataProvider<vscode.TreeItem> {
    private static silentOutputChannel: vscode.OutputChannel = {
        name: 'silent-channel',
        append: () => { },
        appendLine: () => { },
        replace: () => { },
        clear: () => { },
        show: () => { },
        hide: () => { },
        dispose: () => { },
    };

    private _onDidChangeTreeData: vscode.EventEmitter<
        vscode.TreeItem | undefined | null | void
    > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        vscode.TreeItem | undefined | null | void
    > = this._onDidChangeTreeData.event;

    private sessionsCache: Session[] = [];
    private isFetching = false;

    constructor(private context: vscode.ExtensionContext) { }

    private async fetchAndProcessSessions(
        isBackground: boolean = false
    ): Promise<void> {
        if (this.isFetching) {
            logChannel.appendLine("Jules: Fetch already in progress. Skipping.");
            return;
        }
        this.isFetching = true;
        logChannel.appendLine("Jules: Starting to fetch and process sessions...");

        try {
            const apiKey = await getStoredApiKey(this.context);
            if (!apiKey) {
                this.sessionsCache = [];
                return;
            }

            const response = await fetchWithTimeout(`${JULES_API_BASE_URL}/sessions`, {
                method: "GET",
                headers: {
                    "X-Goog-Api-Key": apiKey,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                const errorMsg = `Failed to fetch sessions: ${response.status} ${response.statusText}`;
                logChannel.appendLine(`Jules: ${errorMsg}`);
                if (!isBackground) {
                    vscode.window.showErrorMessage(errorMsg);
                }
                this.sessionsCache = [];
                return;
            }

            const data = (await response.json()) as SessionsResponse;
            if (!data.sessions || !Array.isArray(data.sessions)) {
                logChannel.appendLine("Jules: No sessions found or invalid response format");
                this.sessionsCache = [];
                return;
            }

            // デバッグ: APIレスポンスの生データを確認
            logChannel.appendLine(`Jules: Debug - Raw API response sample (first 3 sessions):`);
            data.sessions.slice(0, 3).forEach((s: any, i: number) => {
                logChannel.appendLine(`  [${i}] name=${s.name}, state=${s.state}, title=${sanitizeForLogging(s.title)}`);
                logChannel.appendLine(`      updateTime=${s.updateTime}`);
            });

            logChannel.appendLine(`Jules: Found ${data.sessions.length} total sessions`);

            const allSessionsMapped = data.sessions.map((session) => ({
                ...session,
                rawState: session.state,
                state: mapApiStateToSessionState(session.state),
            }));

            // デバッグ: 全セッションのrawStateをログ出力
            logChannel.appendLine(`Jules: Debug - Total sessions: ${allSessionsMapped.length}`);
            const stateCounts = allSessionsMapped.reduce((acc, s) => {
                acc[s.rawState] = (acc[s.rawState] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            logChannel.appendLine(`Jules: Debug - State counts: ${JSON.stringify(stateCounts)}`);

            this.processSessionNotifications(
                allSessionsMapped,
                SESSION_STATE.AWAITING_PLAN_APPROVAL,
                (session) => notifyPlanAwaitingApproval(session, this.context),
                "plan approval"
            );

            this.processSessionNotifications(
                allSessionsMapped,
                SESSION_STATE.AWAITING_USER_FEEDBACK,
                notifyUserFeedbackRequired,
                "user feedback"
            );

            // --- Check for completed sessions (PR created) ---
            const completedSessions = checkForCompletedSessions(allSessionsMapped);
            if (completedSessions.length > 0) {
                logChannel.appendLine(
                    `Jules: Found ${completedSessions.length} completed sessions`
                );
                for (const session of completedSessions) {
                    const prUrl = extractPRUrl(session);
                    if (prUrl) {
                        notifyPRCreated(session, prUrl).catch((error) => {
                            logChannel.appendLine(`Jules: Failed to show PR notification: ${error}`);
                        });
                    }
                }
            }

            // --- Update previous states after all checks ---
            await updatePreviousStates(allSessionsMapped, this.context);

            // --- Update the cache ---
            this.sessionsCache = allSessionsMapped;
            if (isBackground) {
                // Errors are handled inside _refreshBranchCacheInBackground, so we call it fire-and-forget.
                // The void operator is used to intentionally ignore the promise and avoid lint errors about floating promises.
                void this._refreshBranchCacheInBackground(apiKey);
            }
        } catch (error) {
            logChannel.appendLine(`Jules: Error during fetchAndProcessSessions: ${error}`);
            // Retain cache on error to avoid losing data
        } finally {
            this.isFetching = false;
            logChannel.appendLine("Jules: Finished fetching and processing sessions.");
            // Fire the event to refresh the view with the new data
            this._onDidChangeTreeData.fire();
        }
    }

    private async _refreshBranchCacheInBackground(apiKey: string): Promise<void> {
        const selectedSource = this.context.globalState.get<SourceType>("selected-source");
        if (!selectedSource) {
            return;
        }

        console.log(`Jules: Background refresh, updating branches for ${selectedSource.name}`);
        try {
            const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);
            // Use forceRefresh: false to respect the cache TTL (5 min).
            // The createSession command handles stale cache gracefully by re-fetching if the selected branch is missing from the remote list.
            await getBranchesForSession(selectedSource, apiClient, JulesSessionsProvider.silentOutputChannel, this.context, { forceRefresh: false, showProgress: false });
            console.log("Jules: Branch cache updated successfully during background refresh");
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Jules: Failed to update branch cache during background refresh for ${selectedSource.name}: ${errorMessage}`);
        }
    }

    async refresh(isBackground: boolean = false): Promise<void> {
        console.log(
            `Jules: refresh() called (isBackground: ${isBackground}), starting fetch.`
        );
        await this.fetchAndProcessSessions(isBackground);
    }

    private processSessionNotifications(
        sessions: Session[],
        state: string,
        notifier: (session: Session) => Promise<void>,
        notificationType: string
    ) {
        const sessionsToNotify = checkForSessionsInState(sessions, state);
        if (sessionsToNotify.length > 0) {
            logChannel.appendLine(
                `Jules: Found ${sessionsToNotify.length} sessions awaiting ${notificationType}`
            );
            for (const session of sessionsToNotify) {
                if (!notifiedSessions.has(session.name)) {
                    notifier(session).catch((error) => {
                        logChannel.appendLine(
                            `Jules: Failed to show ${notificationType} notification for session '${session.name}' (${sanitizeForLogging(session.title)}): ${error}`
                        );
                    });
                    notifiedSessions.add(session.name);
                }
            }
        }
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
            return [];
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
            return [];
        }

        return filteredSessions.map((session) => new SessionTreeItem(session));
    }
}
