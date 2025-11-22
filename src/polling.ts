import * as vscode from 'vscode';
import { JULES_API_BASE_URL } from './constants';
import { JulesApiClient } from './julesApiClient';
import { SessionManager } from './sessionManager';
import { LocalSession, Activity, PlanGenerated } from './types';

export class PollingManager {
    private pollingInterval: NodeJS.Timeout | undefined;
    private isPolling = false;

    constructor(
        private context: vscode.ExtensionContext,
        private sessionManager: SessionManager,
        private outputChannel: vscode.OutputChannel,
        private onPlanAwaitingApproval: (session: LocalSession, plan: PlanGenerated) => void
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
            const activeSessions = sessions.filter(s => s.state === 'RUNNING');

            if (activeSessions.length === 0) {
                this.isPolling = false;
                return;
            }

            const apiKey = await this.context.secrets.get("jules-api-key");
            if (!apiKey) {
                this.outputChannel.appendLine('[Jules] Polling skipped: No API Key');
                this.isPolling = false;
                return;
            }

            const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

            for (const session of activeSessions) {
                await this.pollSession(session, apiClient);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[Jules] Polling error: ${error.message}`);
        } finally {
            this.isPolling = false;
        }
    }

    private async pollSession(session: LocalSession, apiClient: JulesApiClient) {
        try {
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
                        this.onPlanAwaitingApproval(session, activity.planGenerated);
                    } else if (activity.sessionCompleted) {
                        await this.sessionManager.updateSessionState(session.name, 'COMPLETED', 'completed');
                        vscode.window.showInformationMessage(`Session ${session.title} completed!`);
                    }
                }
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[Jules] Failed to poll session ${session.name}: ${error.message}`);
        }
    }
}
