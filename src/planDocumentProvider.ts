import * as vscode from "vscode";
import { formatFullPlan, type Plan } from "./planUtils";
import { isValidSessionId } from "./securityUtils";

/**
 * TextDocumentContentProvider for displaying plan content in a virtual document.
 * Uses the `jules-plan` URI scheme to provide Markdown-formatted plan content.
 */
export class JulesPlanDocumentProvider implements vscode.TextDocumentContentProvider {
    private readonly contents = new Map<string, string>();

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) ?? "";
    }

    setContent(uri: vscode.Uri, content: string): void {
        this.contents.set(uri.toString(), content);
    }

    clearContent(uri: vscode.Uri): void {
        this.contents.delete(uri.toString());
    }

    buildUri(sessionId: string): vscode.Uri {
        const normalized = sessionId.replace(/^sessions\//, "");
        // Use .md extension to enable Markdown syntax highlighting
        return vscode.Uri.parse(`jules-plan://sessions/${normalized}/plan.md`);
    }
}

export interface ReviewPlanOptions {
    sessionId: string;
    sessionTitle?: string;
    plan: Plan | null;
    logChannel: vscode.OutputChannel;
    planProvider: JulesPlanDocumentProvider;
    onApprove: (sessionId: string) => Promise<void>;
}

/**
 * Opens a virtual document displaying the plan for review.
 * After the user reviews the document, shows an approve option.
 * User can dismiss the dialog to leave the plan in pending state.
 */
export async function reviewPlanForSession(options: ReviewPlanOptions): Promise<void> {
    const {
        sessionId,
        sessionTitle,
        plan,
        logChannel,
        planProvider,
        onApprove,
    } = options;

    if (!isValidSessionId(sessionId)) {
        vscode.window.showErrorMessage("Invalid session ID.");
        return;
    }

    try {
        if (!plan) {
            vscode.window.showErrorMessage("No plan available for this session.");
            return;
        }

        // Format and display the plan
        const planContent = formatFullPlan(plan, sessionTitle);
        const uri = planProvider.buildUri(sessionId);
        planProvider.setContent(uri, planContent);

        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, {
            preview: true,
            viewColumn: vscode.ViewColumn.Active,
        });

        // Show approve option (user can dismiss to leave plan pending)
        const action = await vscode.window.showInformationMessage(
            sessionTitle
                ? `Plan for "${sessionTitle}" is ready for review.`
                : "Plan is ready for review.",
            { modal: false },
            "Approve Plan"
        );

        try {
            if (action === "Approve Plan") {
                await onApprove(sessionId);
            }
            // If dismissed, plan remains in pending state
        } finally {
            // Clean up the virtual document content to prevent memory leaks
            planProvider.clearContent(uri);
        }
    } catch (error) {
        logChannel.appendLine(`Jules: Failed to review plan: ${String(error)}`);
        vscode.window.showErrorMessage("Failed to load plan for review.");
    }
}
