import * as vscode from 'vscode';
import { SessionManager } from './sessionManager';
import { LocalSession } from './types';

export class JulesSessionsProvider implements vscode.TreeDataProvider<SessionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SessionTreeItem | undefined | null | void> = new vscode.EventEmitter<SessionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SessionTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private sessionManager: SessionManager) {
        this.sessionManager.onDidChangeSessions(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SessionTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SessionTreeItem): Thenable<SessionTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const sessions = this.sessionManager.getSessions();
        return Promise.resolve(
            sessions.map(session => new SessionTreeItem(
                session
            ))
        );
    }
}

export class SessionTreeItem extends vscode.TreeItem {
    public readonly sessionId: string;
    public readonly state: string;

    constructor(
        public readonly session: LocalSession
    ) {
        super(session.title || session.name, vscode.TreeItemCollapsibleState.None);
        this.sessionId = session.name;
        this.state = session.state;
        
        this.tooltip = `${this.label} (${this.state})`;
        this.description = this.state;
        this.contextValue = 'session';
        
        let iconName = 'circle-slash';
        if (this.state === 'RUNNING') {
            iconName = 'play-circle';
        } else if (this.state === 'COMPLETED') {
            iconName = 'pass';
        } else if (this.state === 'FAILED') {
            iconName = 'error';
        }
        
        this.iconPath = new vscode.ThemeIcon(iconName);
        
        this.command = {
            command: 'jules-extension.sessionSelected',
            title: 'Open Session',
            arguments: [this.session]
        };
    }
}
