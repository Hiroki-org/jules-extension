import * as vscode from "vscode";
import { Session } from './types';
import { SESSION_STATE } from './sessionState';

const SHOW_ACTIVITIES_COMMAND = 'jules-extension.showActivities';

export class SessionTreeItem extends vscode.TreeItem {
    constructor(public readonly session: Session) {
        super(session.title || session.name, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${session.name} - ${session.state}${session.requirePlanApproval ? ' (Plan Approval Required)' : ''}`;
        this.description = session.state;
        this.iconPath = this.getIcon(session.state, session.rawState);
        this.contextValue = "jules-session";
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
