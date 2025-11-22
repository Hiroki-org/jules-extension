import * as vscode from 'vscode';
import { Session } from './types';
import { approvePlan } from './commandHandlers';

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
