import * as vscode from 'vscode';
import { LocalSession, Session, Activity } from './types';

export class SessionManager {
    private sessions: LocalSession[] = [];
    private _onDidChangeSessions = new vscode.EventEmitter<void>();
    readonly onDidChangeSessions = this._onDidChangeSessions.event;

    constructor(
        private context: vscode.ExtensionContext,
        private outputChannel: vscode.OutputChannel
    ) {
        this.loadSessions();
    }

    private loadSessions() {
        const savedSessions = this.context.globalState.get<LocalSession[]>('jules_sessions', []);
        this.sessions = savedSessions;
    }

    private async saveSessions() {
        await this.context.globalState.update('jules_sessions', this.sessions);
        this._onDidChangeSessions.fire();
    }

    getSessions(): LocalSession[] {
        const hideClosedPR = vscode.workspace.getConfiguration('jules-extension').get<boolean>('hideClosedPRSessions', true);

        if (hideClosedPR) {
            // COMPLETED と FAILED を除外
            return this.sessions.filter(s => s.state !== 'COMPLETED' && s.state !== 'FAILED');
        }

        return this.sessions;
    }

    getSession(sessionName: string): LocalSession | undefined {
        return this.sessions.find(s => s.name === sessionName);
    }

    async addSession(session: Session) {
        // Check if exists
        const existingIndex = this.sessions.findIndex(s => s.name === session.name);
        const newSession: LocalSession = {
            ...session,
            activities: existingIndex >= 0 ? this.sessions[existingIndex].activities : [],
            lastPollTime: existingIndex >= 0 ? this.sessions[existingIndex].lastPollTime : Date.now()
        };

        if (existingIndex >= 0) {
            this.sessions[existingIndex] = newSession;
        } else {
            this.sessions.unshift(newSession);
        }
        await this.saveSessions();
    }

    async updateSession(sessionName: string, updates: Partial<LocalSession>) {
        const index = this.sessions.findIndex(s => s.name === sessionName);
        if (index >= 0) {
            this.sessions[index] = { ...this.sessions[index], ...updates };
            await this.saveSessions();
        }
    }

    async updateSessionState(sessionName: string, state: Session['state'], rawState: string) {
        const session = this.sessions.find(s => s.name === sessionName);
        if (session) {
            session.state = state;
            session.rawState = rawState;
            await this.saveSessions();
        }
    }

    async addActivity(sessionName: string, activity: Activity) {
        const session = this.sessions.find(s => s.name === sessionName);
        if (session) {
            if (!session.activities) {
                session.activities = [];
            }
            // Avoid duplicates
            if (!session.activities.some(a => a.id === activity.id)) {
                session.activities.push(activity);
                await this.saveSessions();
            }
        }
    }

    async deleteSession(sessionName: string) {
        this.sessions = this.sessions.filter(s => s.name !== sessionName);
        await this.saveSessions();
    }

    async clearAllSessions() {
        this.sessions = [];
        await this.saveSessions();
    }
}
