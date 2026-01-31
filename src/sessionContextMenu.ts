import * as vscode from "vscode";
import type { Session } from "./extension";

/**
 * Extracts the source branch name (PR head branch) from a session.
 * This is the branch that was used to create the PR.
 * Returns null if no branch information is available.
 */
export function getBranchNameForSession(session: Session): string | null {
    try {
        const branchName = session.sourceContext?.githubRepoContext?.startingBranch;
        if (!branchName || typeof branchName !== "string" || branchName.trim() === "") {
            return null;
        }
        return branchName.trim();
    } catch (error) {
        console.warn(`[Jules] Unexpected error extracting branch name from session`);
        return null;
    }
}

/**
 * Checkout to a specified branch using VS Code's Git extension.
 * Handles various error cases including missing Git extension, uncommitted changes, etc.
 * 
 * @param branchName The name of the branch to checkout
 * @param logChannel Optional output channel for logging
 * @returns true if checkout succeeded, false otherwise
 */
export async function checkoutToBranch(
    branchName: string,
    logChannel?: vscode.OutputChannel
): Promise<boolean> {
    const log = (msg: string) => {
        console.log(`[Jules] ${msg}`);
        logChannel?.appendLine(`[Jules] ${msg}`);
    };

    try {
        // Get Git extension
        const gitExtension = vscode.extensions.getExtension("vscode.git");
        if (!gitExtension) {
            vscode.window.showErrorMessage(
                "Git extension is not available. Please ensure Git is installed."
            );
            return false;
        }

        const git = gitExtension.exports.getAPI(1);
        if (!git) {
            vscode.window.showErrorMessage(
                "Failed to access Git API."
            );
            return false;
        }

        // Get repository
        const repositories = git.repositories;
        if (!repositories || repositories.length === 0) {
            vscode.window.showErrorMessage(
                "No Git repository found in the workspace."
            );
            return false;
        }

        // Select repository (if multiple, let user choose)
        let repository;
        if (repositories.length === 1) {
            repository = repositories[0];
        } else {
            interface RepoItem extends vscode.QuickPickItem {
                repo: any;
            }
            const repoItems: RepoItem[] = repositories.map((repo: any, index: number) => ({
                label: repo.rootUri.fsPath.split("/").pop() || `Repository ${index + 1}`,
                description: repo.rootUri.fsPath,
                repo
            }));
            const selected = await vscode.window.showQuickPick(repoItems, {
                placeHolder: "Select a Git repository for checkout"
            });
            if (!selected) {
                log("Repository selection cancelled");
                return false;
            }
            repository = selected.repo;
        }

        log(`Checking out to branch: ${branchName}`);

        // Check for uncommitted changes
        const hasUncommittedChanges = 
            repository.state.workingTreeChanges.length > 0 ||
            repository.state.indexChanges.length > 0;

        if (hasUncommittedChanges) {
            const action = await vscode.window.showWarningMessage(
                `You have uncommitted changes. Checkout to "${branchName}" may fail or cause issues.`,
                { modal: true },
                "Checkout Anyway",
                "Stash Changes & Checkout",
                "Cancel"
            );

            if (action === "Cancel" || !action) {
                log("Checkout cancelled due to uncommitted changes");
                return false;
            }

            if (action === "Stash Changes & Checkout") {
                try {
                    await repository.stash();
                    log("Changes stashed successfully");
                } catch (stashError) {
                    const msg = stashError instanceof Error ? stashError.message : String(stashError);
                    vscode.window.showErrorMessage(`Failed to stash changes: ${msg}`);
                    return false;
                }
            }
        }

        // Try to checkout the branch
        try {
            await repository.checkout(branchName);
            log(`Successfully checked out to branch: ${branchName}`);
            vscode.window.showInformationMessage(
                `Checked out to branch: ${branchName}`
            );
            return true;
        } catch (checkoutError: any) {
            const errorMsg = checkoutError?.message || String(checkoutError);
            
            // If branch not found locally, try to fetch and checkout from remote
            if (errorMsg.includes("did not match") || errorMsg.includes("not found") || errorMsg.includes("pathspec")) {
                log(`Branch "${branchName}" not found locally, attempting to fetch from remote...`);
                
                const fetchAndCheckout = await vscode.window.showInformationMessage(
                    `Branch "${branchName}" not found locally. Fetch from remote?`,
                    "Fetch & Checkout",
                    "Cancel"
                );

                if (fetchAndCheckout !== "Fetch & Checkout") {
                    return false;
                }

                try {
                    // Fetch all remotes
                    await repository.fetch();
                    log("Fetched from remotes successfully");

                    // Try checkout again (Git should now see the remote branch)
                    await repository.checkout(branchName);
                    log(`Successfully checked out to branch: ${branchName}`);
                    vscode.window.showInformationMessage(
                        `Checked out to branch: ${branchName}`
                    );
                    return true;
                } catch (fetchError: any) {
                    const fetchMsg = fetchError?.message || String(fetchError);
                    log(`Failed to fetch and checkout: ${fetchMsg}`);
                    vscode.window.showErrorMessage(
                        `Failed to checkout branch "${branchName}": ${fetchMsg}`
                    );
                    return false;
                }
            }

            // Other checkout errors
            log(`Checkout failed: ${errorMsg}`);
            vscode.window.showErrorMessage(
                `Failed to checkout branch "${branchName}": ${errorMsg}`
            );
            return false;
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Jules] Checkout error: ${msg}`);
        logChannel?.appendLine(`[Jules] Checkout error: ${msg}`);
        vscode.window.showErrorMessage(
            `Failed to checkout: ${msg}`
        );
        return false;
    }
}

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
