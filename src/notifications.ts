import * as vscode from "vscode";
import { Session } from './types';

// Constants
const VIEW_DETAILS_ACTION = 'View Details';
const SHOW_ACTIVITIES_COMMAND = 'jules-extension.showActivities';

/**
 * PRが作成された時に通知する
 */
export async function notifyPRCreated(session: Session, prUrl: string): Promise<void> {
    const result = await vscode.window.showInformationMessage(
        `Session "${session.title}" has completed and created a PR!`,
        "Open PR"
    );
    if (result === "Open PR") {
        vscode.env.openExternal(vscode.Uri.parse(prUrl));
    }
}

/**
 * プラン承認待ちを通知する
 */
export async function notifyPlanAwaitingApproval(
    session: Session,
    context: vscode.ExtensionContext,
    approvePlanFn: (sessionId: string, context: vscode.ExtensionContext) => Promise<void>
): Promise<void> {
    const selection = await vscode.window.showInformationMessage(
        `Jules has a plan ready for your approval in session: "${session.title}"`,
        "Approve Plan",
        VIEW_DETAILS_ACTION
    );

    if (selection === "Approve Plan") {
        await approvePlanFn(session.name, context);
    } else if (selection === VIEW_DETAILS_ACTION) {
        await vscode.commands.executeCommand(
            SHOW_ACTIVITIES_COMMAND,
            session.name
        );
    }
}

/**
 * ユーザーフィードバック待ちを通知する
 */
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
