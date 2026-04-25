import * as vscode from "vscode";
import { sanitizeForLogging } from "./securityUtils";

/**
 * Get and activate the VS Code Git Extension API
 */
export async function getGitApi(outputChannel?: vscode.OutputChannel): Promise<any> {
    const logger =
        outputChannel ??
        ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);
    const gitExtension = vscode.extensions.getExtension("vscode.git");
    if (!gitExtension) {
        logger.appendLine("[Jules] vscode.git extension not found");
        throw new Error("Git extension not found");
    }
    // Ensure the Git extension is activated
    await gitExtension.activate();
    const git = gitExtension.exports.getAPI(1);
    if (!git) {
        logger.appendLine("[Jules] vscode.git extension did not return a Git API");
        throw new Error("Git API not available");
    }
    return git;
}

/**
 * Find the Git repository that corresponds to the given workspace folder
 */
export function getRepositoryForWorkspaceFolder(
    git: any,
    workspaceFolder: vscode.WorkspaceFolder,
    outputChannel?: vscode.OutputChannel,
): any {
    const logger =
        outputChannel ??
        ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);
    const repository = git.repositories.find(
        (repo: any) => repo.rootUri?.fsPath === workspaceFolder.uri.fsPath,
    );
    if (!repository) {
        const safeWsPath = sanitizeForLogging(workspaceFolder.uri.fsPath);
        logger.appendLine(
            `[Jules] No Git repository found for workspace folder ${safeWsPath}`,
        );
        return null;
    }
    return repository;
}

/**
 * Get the remote URL from a repository, with fallback strategy:
 * 1. Try 'origin' remote
 * 2. Fall back to first remote with fetchUrl or pushUrl
 * 3. Return null if none found
 */
export function getRemoteUrl(
    repository: any,
    preferredRemoteName: string = "origin",
    outputChannel?: vscode.OutputChannel,
): string | null {
    const logger =
        outputChannel ??
        ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);

    if (!repository.state.remotes || repository.state.remotes.length === 0) {
        logger.appendLine("[Jules] No remotes found in repository");
        return null;
    }

    // Try to find the preferred remote (default: 'origin')
    let remote = repository.state.remotes.find(
        (r: any) => r.name === preferredRemoteName,
    );

    // Fallback: find first remote with a URL
    if (!remote) {
        remote = repository.state.remotes.find((r: any) => r.fetchUrl || r.pushUrl);
        if (remote) {
            logger.appendLine(
                `[Jules] Preferred remote '${preferredRemoteName}' not found, using '${remote.name}'`,
            );
        }
    }

    if (!remote) {
        logger.appendLine(`[Jules] No remote URL found in repository`);
        return null;
    }

    const remoteUrl = remote.fetchUrl || remote.pushUrl;
    if (!remoteUrl) {
        logger.appendLine(
            `[Jules] Remote '${remote.name}' has no fetchUrl or pushUrl`,
        );
        return null;
    }

    return remoteUrl;
}

/**
 * Get the HEAD commit SHA for the primary workspace folder.
 *
 * This helper intentionally reads only `vscode.workspace.workspaceFolders?.[0]`.
 * Current callers use the same first-folder convention for branch creation, so
 * this does not provide multi-root workspace support.
 *
 * @param outputChannel Optional destination for diagnostics; console is used as a fallback.
 */
export async function getCurrentBranchSha(outputChannel?: vscode.OutputChannel): Promise<string | null> {
    const logger =
        outputChannel ??
        ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            logger.appendLine(
                "[Jules] No workspace folder found to get current branch SHA.",
            );
            return null;
        }

        const git = await getGitApi(outputChannel);
        const repository = getRepositoryForWorkspaceFolder(
            git,
            workspaceFolder,
            outputChannel,
        );
        if (!repository) {
            return null;
        }

        return repository.state.HEAD?.commit || null;
    } catch (error) {
        logger.appendLine(`[Jules] Error getting current branch sha: ${error}`);
        return null;
    }
}
