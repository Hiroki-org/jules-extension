import * as vscode from "vscode";
import { Session } from "./extension";

/**
 * Extracts PR URL from a session, with basic validation.
 * Returns null if no PR URL is found or if the URL is invalid.
 *
 * Priority:
 * 1. PR URL from session outputs (session.outputs[].pullRequest.url)
 *
 * Validation:
 * - Must start with https://github.com/
 * - Must match GitHub PR URL pattern
 */
export function getPullRequestUrlForSession(session: Session): string | null {
    try {
        // Extract PR URL from outputs
        const prUrl = session.outputs?.find((o) => o.pullRequest)?.pullRequest?.url;

        if (!prUrl) {
            return null;
        }

        // Validate: Must be a string
        if (typeof prUrl !== "string") {
            console.warn(
                `[Jules] Invalid PR URL type: expected string, got ${typeof prUrl}`
            );
            return null;
        }

        // Validate: Must start with https://github.com/
        if (!prUrl.startsWith("https://github.com/")) {
            console.warn(
                `[Jules] PR URL does not start with https://github.com/: ${prUrl}`
            );
            return null;
        }

        // Validate: Must match GitHub PR URL pattern
        // Pattern: https://github.com/{owner}/{repo}/pull/{number}
        const githubPrPattern = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/;
        if (!githubPrPattern.test(prUrl)) {
            console.warn(`[Jules] PR URL does not match expected GitHub pattern: ${prUrl}`);
            return null;
        }

        return prUrl;
    } catch (error) {
        console.error(
            `[Jules] Error extracting PR URL from session:`,
            error instanceof Error ? error.message : error
        );
        return null;
    }
}

/**
 * Opens a PR URL in the default browser.
 * Shows error message if URL cannot be opened.
 */
export async function openPullRequestInBrowser(prUrl: string): Promise<void> {
    try {
        const success = await vscode.env.openExternal(vscode.Uri.parse(prUrl));
        if (!success) {
            vscode.window.showWarningMessage(
                "Failed to open the pull request URL in the browser."
            );
        }
    } catch (error) {
        vscode.window.showErrorMessage(
            `Error opening PR: ${error instanceof Error ? error.message : "Unknown error"}`
        );
    }
}
