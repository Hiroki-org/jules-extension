import * as vscode from 'vscode';
import { JULES_API_BASE_URL } from './constants';
import { GitHubAuth } from './githubAuth';
import { SessionManager } from './sessionManager';
import { LocalSession, Activity, PlanGenerated } from './types';

export class PollingManager {
    private pollingInterval: NodeJS.Timeout | undefined;
    private isPolling = false;

    constructor(
        private sessionManager: SessionManager,
        private outputChannel: vscode.OutputChannel,
        private onPlanAwaitingApproval: (session: LocalSession, plan: PlanGenerated) => void
    ) {}

    startPolling() {
        if (this.pollingInterval) {
            return;
        }

        this.outputChannel.appendLine('[Jules] Starting polling...');
        this.pollingInterval = setInterval(() => this.pollSessions(), 5000);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = undefined;
            this.outputChannel.appendLine('[Jules] Stopped polling');
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

            const token = await GitHubAuth.getToken();
            if (!token) {
                this.outputChannel.appendLine('[Jules] Polling skipped: No token');
                this.isPolling = false;
                return;
            }

            for (const session of activeSessions) {
                await this.pollSession(session, token);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[Jules] Polling error: ${error.message}`);
        } finally {
            this.isPolling = false;
        }
    }

    private async pollSession(session: LocalSession, token: string) {
        try {
            // Use session.name as the identifier for the API
            const response = await fetch(`${JULES_API_BASE_URL}/${session.name}/activities`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    // Session might be closed or deleted
                    return;
                }
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json() as { activities: Activity[] };
            const activities = data.activities || [];
            
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
                    // Note: Error handling might need adjustment based on actual API response structure for errors
                }
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[Jules] Failed to poll session ${session.name}: ${error.message}`);
        }
    }
}
