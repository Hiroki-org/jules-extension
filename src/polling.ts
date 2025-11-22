import * as vscode from 'vscode';
import { JULES_API_BASE_URL } from './constants';
import { extractPRUrl } from './githubUtils';
import { JulesApiClient } from './julesApiClient';
import { SessionManager } from './sessionManager';
import { LocalSession, Activity, PlanGenerated, Session } from './types';
import { JulesSessionsProvider } from './treeView';

export class PollingManager {
    private pollingInterval: NodeJS.Timeout | undefined;
    private isPolling = false;

    constructor(
        private context: vscode.ExtensionContext,
        private sessionManager: SessionManager,
        private outputChannel: vscode.OutputChannel,
        private sessionsProvider: JulesSessionsProvider,
        private onPlanAwaitingApproval: (
            session: LocalSession,
            planActivity: Activity,
            context: vscode.ExtensionContext,
            sessionsProvider: JulesSessionsProvider,
            logChannel: vscode.OutputChannel
        ) => Promise<void>
    ) {
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('jules-extension.autoRefresh')) {
                this.restartPolling();
            }
        });
    }

    startPolling() {
        this.restartPolling();
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = undefined;
            this.outputChannel.appendLine('[Jules] Stopped polling');
        }
    }

    private restartPolling() {
        this.stopPolling();

        const config = vscode.workspace.getConfiguration('jules-extension');
        const enabled = config.get<boolean>('autoRefresh.enabled', false);
        const interval = config.get<number>('autoRefresh.interval', 30);

        if (enabled) {
            const intervalMs = Math.max(interval, 10) * 1000;
            this.outputChannel.appendLine(`[Jules] Starting polling (interval: ${interval}s)...`);
            this.pollingInterval = setInterval(() => this.pollSessions(), intervalMs);
        } else {
            this.outputChannel.appendLine('[Jules] Auto-refresh is disabled.');
        }
    }

    private async pollSessions() {
        if (this.isPolling) {
            return;
        }
        this.isPolling = true;

        try {
            const sessions = this.sessionManager.getSessions();

            const apiKey = await this.context.secrets.get("jules-api-key");
            if (!apiKey) {
                this.outputChannel.appendLine('[Jules] Polling skipped: No API Key');
                this.isPolling = false;
                return;
            }

            const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

            // 全セッションをチェック
            for (const session of sessions) {
                await this.pollSession(session, apiClient);

                // AWAITING_PLAN_APPROVAL状態を直接チェック
                if (session.rawState === 'AWAITING_PLAN_APPROVAL') {
                    const notifiedKey = `notified-approval-${session.name}`;
                    const lastNotified = this.context.globalState.get<string>(notifiedKey);

                    // まだ通知していない、または状態が更新された場合のみ通知
                    if (lastNotified !== session.lastPollTime) {
                        this.outputChannel.appendLine(`[Jules] Plan approval detected for session: ${session.name}`);

                        try {
                            // Activitiesを取得
                            const activities = await apiClient.getActivities(session.name);
                            const planActivity = activities.find((a: Activity) => a.planGenerated);

                            if (planActivity) {
                                // notifyPlanAwaitingApprovalを呼ぶ（シグネチャを変更後）
                                await this.onPlanAwaitingApproval(session, planActivity, this.context, this.sessionsProvider, this.outputChannel);

                                // 通知済みとしてマーク
                                await this.context.globalState.update(notifiedKey, session.lastPollTime);
                            }
                        } catch (error) {
                            this.outputChannel.appendLine(`[Jules] Error notifying plan approval: ${error}`);
                        }
                    }
                }
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[Jules] Polling error: ${error.message}`);
        } finally {
            this.isPolling = false;
        }
    }

    private mapApiStateToSessionState(apiState: string): Session['state'] {
        switch (apiState) {
            case 'COMPLETED': return 'COMPLETED';
            case 'FAILED': return 'FAILED';
            case 'CANCELLED': return 'CANCELLED';
            case 'PAUSED': return 'CANCELLED';
            case 'AWAITING_PLAN_APPROVAL': return 'RUNNING';
            default: return 'RUNNING';
        }
    }

    private async pollSession(session: LocalSession, apiClient: JulesApiClient) {
        try {
            // Fetch latest session state
            const remoteSession = await apiClient.getSession(session.name);

            // Update local session state if changed
            if (remoteSession.state !== session.rawState) {
                const mappedState = this.mapApiStateToSessionState(remoteSession.state);
                await this.sessionManager.updateSessionState(session.name, mappedState, remoteSession.state);
            }

            const activities = await apiClient.getActivities(session.name);
            const currentActivities = session.activities || [];

            // Detect new activities by comparing IDs
            const newActivities = activities.filter(a =>
                !currentActivities.some(existing => existing.id === a.id)
            );

            if (newActivities.length > 0) {
                this.outputChannel.appendLine(`[Jules] New activities for session ${session.name}: ${newActivities.length}`);

                for (const activity of newActivities) {
                    await this.sessionManager.addActivity(session.name, activity);

                    // Handle specific activity types based on property existence
                    if (activity.planGenerated) {
                        await this.onPlanAwaitingApproval(session, activity, this.context, this.sessionsProvider, this.outputChannel);
                    } else if (activity.sessionCompleted) {
                        await this.sessionManager.updateSessionState(session.name, 'COMPLETED', 'completed');

                        let prUrl: string | undefined;
                        try {
                            const fullSession = await apiClient.getSession(session.name);
                            if (fullSession.outputs) {
                                for (const output of fullSession.outputs) {
                                    if (output.pullRequest?.url) {
                                        prUrl = output.pullRequest.url;
                                        break;
                                    }
                                }
                            }
                        } catch (err) {
                            console.error('Error fetching session details:', err);
                        }

                        if (!prUrl && activity.description) {
                            const extracted = extractPRUrl(activity.description);
                            if (extracted) {
                                prUrl = extracted;
                            }
                        }

                        if (prUrl) {
                            const openPr = "Open PR";
                            vscode.window.showInformationMessage(`Session ${session.title} completed. PR created.`, openPr).then(selection => {
                                if (selection === openPr) {
                                    vscode.env.openExternal(vscode.Uri.parse(prUrl!));
                                }
                            });
                        } else {
                            vscode.window.showInformationMessage(`Session ${session.title} completed!`);
                        }
                    }
                }
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[Jules] Failed to poll session ${session.name}: ${error.message}`);
        }
    }
}
