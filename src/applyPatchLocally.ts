import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Session } from './types';
import { ChangeSetSummary, getChangeSetGitPatch, getChangeSetUnidiffPatch } from './sessionArtifacts';
import { getGitApi } from './gitUtils';
import { selectRepository, handleUncommittedChanges } from './sessionContextMenu';

const MAX_BRANCH_NAME_ATTEMPTS = 20;

export async function applyPatchLocallyForSession(options: {
    session: Session;
    changeSet: ChangeSetSummary;
    outputChannel: vscode.OutputChannel;
}): Promise<void> {
    const { session, changeSet, outputChannel } = options;

    const log = (msg: string) => {
        console.log(`[Jules] ${msg}`);
        outputChannel.appendLine(`[Jules] ${msg}`);
    };

    // 1. Premise check
    const gitPatch = getChangeSetGitPatch(changeSet);
    if (!gitPatch) {
        vscode.window.showErrorMessage("This session's ChangeSet does not contain a gitPatch.");
        return;
    }

    const unidiffPatch = getChangeSetUnidiffPatch(changeSet);
    const baseCommitId = changeSet.baseCommitId;
    const suggestedCommitMessage = changeSet.suggestedCommitMessage;

    if (!unidiffPatch) {
        vscode.window.showErrorMessage("This session's ChangeSet does not contain a unidiffPatch.");
        return;
    }

    try {
        // 2. Workspace / Repository selection
        const gitApi = await getGitApi(outputChannel);
        const repositories = gitApi.repositories;
        if (!repositories || repositories.length === 0) {
            vscode.window.showErrorMessage("No Git repository found in the workspace.");
            return;
        }
        const resolvedGitPath = typeof gitApi.git?.path === "string" && gitApi.git.path.trim().length > 0
            ? gitApi.git.path
            : undefined;
        if (!resolvedGitPath) {
            log("VS Code Git API did not expose git.path; falling back to 'git' on PATH.");
        }
        const gitExecutable = resolvedGitPath ?? "git";

        const repository = await selectRepository(repositories, log);
        if (!repository) {
            return;
        }

        const sessionIdValue = session.name.split("/").pop() || "unknown";
        const branchName = `jules-patch-${sessionIdValue}`;

        // 3. dirty working tree inspection
        const canProceed = await handleUncommittedChanges(repository, branchName, log);
        if (!canProceed) {
            return;
        }

        // 4. fetch
        log("Fetching from remote...");
        try {
            await repository.fetch();
        } catch (fetchError: any) {
            vscode.window.showErrorMessage(`Failed to fetch from remote: ${fetchError.message}`);
            return;
        }

        // 5. baseCommitId resolution
        let commitToBranchFrom = baseCommitId;
        if (baseCommitId) {
            try {
                await repository.getCommit(baseCommitId);
            } catch (e) {
                log(`Commit ${baseCommitId} not found in repository after fetch.`);
                commitToBranchFrom = undefined;
            }
        }

        if (!commitToBranchFrom) {
            const startingBranch = session.sourceContext?.githubRepoContext?.startingBranch?.trim();
            if (startingBranch) {
                const action = await vscode.window.showWarningMessage(
                    `Base commit ${baseCommitId ?? 'unknown'} not found. Fallback to starting branch "${startingBranch}"?`,
                    { modal: true },
                    "Fallback",
                    "Cancel"
                );
                if (action !== "Fallback") {
                    return;
                }
                commitToBranchFrom = await resolveStartingBranchRef(repository, startingBranch);
                if (commitToBranchFrom !== startingBranch) {
                    log(`Resolved starting branch "${startingBranch}" to "${commitToBranchFrom}".`);
                }
            } else {
                vscode.window.showErrorMessage("Base commit not found and no starting branch specified.");
                return;
            }
        }

        // 6. Create new branch
        log(`Creating branch ${branchName} from ${commitToBranchFrom}...`);
        
        const finalBranchName = await findAvailableBranchName(repository, branchName);
        const originalBranch = typeof repository.state?.HEAD?.name === "string" && repository.state.HEAD.name.trim().length > 0
            ? repository.state.HEAD.name
            : undefined;

        try {
            await repository.createBranch(finalBranchName, true, commitToBranchFrom);
            log(`Checked out to new branch: ${finalBranchName}`);
        } catch (branchError: any) {
            vscode.window.showErrorMessage(`Failed to create branch: ${branchError.message}`);
            return;
        }

        // 7. Apply patch
        const patchFileName = `jules-${sessionIdValue}-${Date.now()}.patch`;
        const patchFilePath = path.join(os.tmpdir(), patchFileName);
        
        await fs.writeFile(patchFilePath, unidiffPatch, { encoding: "utf8", mode: 0o600 });

        log(`Applying patch from ${patchFilePath}...`);
        
        try {
            await new Promise<void>((resolve, reject) => {
                childProcess.execFile(
                    gitExecutable,
                    ["apply", "--3way", patchFilePath], 
                    { cwd: repository.rootUri.fsPath }, 
                    (error, stdout, stderr) => {
                        if (error) {
                            const failureDetails = stderr || error.message;
                            log(`Git apply failed for ${patchFilePath}: ${failureDetails}`);
                            reject(new Error(`git apply failed. Check Jules output channel for details.`));
                        } else {
                            resolve();
                        }
                    }
                );
            });
            
            // Clean up patch file on success
            await fs.unlink(patchFilePath).catch(() => {});
        } catch (applyError: any) {
            const branchStateMessage = await restoreOriginalBranchAfterApplyFailure(
                repository,
                originalBranch,
                finalBranchName,
                log,
            );
            log(`Patch file saved at: ${patchFilePath}`);
            vscode.window.showErrorMessage(`Failed to apply patch: ${applyError.message}\n${branchStateMessage}\nPatch file saved at: ${patchFilePath}`);
            return;
        }

        // 8. Pre-fill commit message
        if (suggestedCommitMessage) {
            repository.inputBox.value = suggestedCommitMessage;
        }

        // 9. Completion notification
        vscode.window.showInformationMessage(
            `Patch applied to branch "${finalBranchName}". Please review the changes in the Source Control view and commit.`
        );

    } catch (err: any) {
        log(`Error applying patch locally: ${err.message}`);
        vscode.window.showErrorMessage(`An error occurred: ${err.message}`);
    }
}

function isBranchNotFoundError(error: unknown): boolean {
    const structuredValues = ["code", "gitErrorCode", "name"]
        .map((key) => readErrorStringProperty(error, key))
        .filter((value): value is string => typeof value === "string");
    if (structuredValues.some((value) => /branch.*not.*found|not.*found.*branch|no.*such.*branch|does.*not.*exist|unknown.*revision|could.*not.*find.*ref|enoent/i.test(value))) {
        return true;
    }

    const message = error instanceof Error ? error.message : String(error);
    return /branch.*not found|not found.*branch|no such branch|does not exist|unknown revision|could not find ref|ブランチ.*(見つかりません|見つからない|存在しません|存在しない)|存在しない.*ブランチ|参照.*(見つかりません|見つからない)|リビジョン.*不明/i.test(message);
}

function readErrorStringProperty(error: unknown, propertyName: string): string | undefined {
    if (!error || typeof error !== "object") {
        return undefined;
    }
    const value = (error as Record<string, unknown>)[propertyName];
    return typeof value === "string" ? value : undefined;
}

async function restoreOriginalBranchAfterApplyFailure(
    repository: any,
    originalBranch: string | undefined,
    failedBranchName: string,
    log: (msg: string) => void,
): Promise<string> {
    if (!originalBranch || typeof repository.checkout !== "function") {
        const message = `Current branch may remain "${failedBranchName}".`;
        log(`Patch apply failed on ${failedBranchName}; original branch is unavailable for automatic restore.`);
        return message;
    }

    try {
        await repository.checkout(originalBranch);
        const message = `Restored original branch "${originalBranch}" after patch failure. Failed branch "${failedBranchName}" remains for inspection.`;
        log(message);
        return message;
    } catch (checkoutError: any) {
        const message = `Could not restore original branch "${originalBranch}". Current branch may remain "${failedBranchName}".`;
        log(`${message} Checkout error: ${checkoutError?.message ?? checkoutError}`);
        return message;
    }
}

async function branchExists(repository: any, branchRef: string): Promise<boolean> {
    try {
        return !!(await repository.getBranch(branchRef));
    } catch (error) {
        if (isBranchNotFoundError(error)) {
            return false;
        }
        throw error;
    }
}

async function resolveStartingBranchRef(repository: any, startingBranch: string): Promise<string> {
    const branchRef = startingBranch.trim();
    if (branchRef.length === 0) {
        return startingBranch;
    }
    if (await branchExists(repository, branchRef)) {
        return branchRef;
    }

    const remotes = Array.isArray(repository.state?.remotes) ? repository.state.remotes : [];
    const remoteNames = remotes
        .map((remote: { name?: unknown }) => typeof remote.name === "string" ? remote.name.trim() : "")
        .filter((name: string) => name.length > 0)
        .sort((a: string, b: string) => {
            if (a === "origin") {
                return -1;
            }
            if (b === "origin") {
                return 1;
            }
            return a.localeCompare(b);
        });

    for (const remoteName of remoteNames) {
        const remoteRef = `${remoteName}/${branchRef}`;
        if (await branchExists(repository, remoteRef)) {
            return remoteRef;
        }
    }

    return branchRef;
}

async function findAvailableBranchName(repository: any, branchName: string): Promise<string> {
    for (let attempt = 1; attempt <= MAX_BRANCH_NAME_ATTEMPTS; attempt += 1) {
        const candidate = attempt === 1 ? branchName : `${branchName}-${attempt}`;
        try {
            const branch = await repository.getBranch(candidate);
            if (!branch) {
                return candidate;
            }
        } catch (error) {
            if (isBranchNotFoundError(error)) {
                return candidate;
            }
            throw error;
        }
    }
    throw new Error(`Could not find an available branch name after ${MAX_BRANCH_NAME_ATTEMPTS} attempts.`);
}
