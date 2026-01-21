import * as vscode from "vscode";
import type { Session } from "./extension";

/**
 * Extracts PR URL from a session, with URL parsing-based validation.
 * Returns null if no PR URL is found or if the URL is invalid.
 * 
 * Validation:
 * - Must be a valid URL with https:// protocol
 * - Must be hosted on github.com
 * - Must have path matching /owner/repo/pull/number
 * - Canonical form is returned (without query strings or fragments)
 */
export function getPullRequestUrlForSession(session: Session): string | null {
    try {
        // Extract PR URL from outputs
        const raw = session.outputs?.find((o) => o.pullRequest)?.pullRequest?.url;

        if (!raw) {
            return null;
        }

        // Validate: Must be a string
        if (typeof raw !== "string") {
            console.warn(`[Jules] PR URL type validation failed: expected string, got ${typeof raw}`);
            return null;
        }

        // Parse URL
        let u: URL;
        try {
            u = new URL(raw);
        } catch (e) {
            console.warn(`[Jules] PR URL parsing failed: invalid URL format`);
            return null;
        }

        // Validate protocol and hostname
        if (u.protocol !== "https:") {
            console.warn(`[Jules] PR URL protocol validation failed: expected https:, got ${u.protocol}`);
            return null;
        }

        if (u.hostname !== "github.com") {
            console.warn(`[Jules] PR URL hostname validation failed: expected github.com, got ${u.hostname}`);
            return null;
        }

        // Parse pathname: should be /owner/repo/pull/number
        const segments = u.pathname
            .split("/")
            .filter((seg) => seg.length > 0);

        if (segments.length < 4) {
            console.warn(`[Jules] PR URL pathname validation failed: expected at least 4 segments, got ${segments.length}`);
            return null;
        }

        const [owner, repo, pullKeyword, numberStr] = segments;

        // Validate owner and repo are not empty
        if (!owner || !repo) {
            console.warn(`[Jules] PR URL owner/repo validation failed: owner or repo is empty`);
            return null;
        }

        // Validate pull keyword
        if (pullKeyword !== "pull") {
            console.warn(`[Jules] PR URL keyword validation failed: expected 'pull', got '${pullKeyword}'`);
            return null;
        }

        // Validate number is a positive integer
        if (!/^\d+$/.test(numberStr)) {
            console.warn(`[Jules] PR URL number validation failed: expected numeric PR number, got '${numberStr}'`);
            return null;
        }

        // Return canonical form (normalized URL without query/fragment)
        const canonical = `https://github.com/${owner}/${repo}/pull/${numberStr}`;
        return canonical;
    } catch (error) {
        console.warn(`[Jules] Unexpected error extracting PR URL from session`);
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
            vscode.window.showErrorMessage(
                "Failed to open pull request in browser."
            );
        }
    } catch (error) {
        console.error("Failed to open pull request in browser:", error);
        vscode.window.showErrorMessage(
            "Failed to open pull request in browser."
        );
    }
}
