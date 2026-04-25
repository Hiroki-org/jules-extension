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
        const gitExecutable = typeof gitApi.git?.path === "string" && gitApi.git.path.trim().length > 0
            ? gitApi.git.path
            : "git";

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
            const startingBranch = session.sourceContext?.githubRepoContext?.startingBranch;
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
                commitToBranchFrom = startingBranch;
            } else {
                vscode.window.showErrorMessage("Base commit not found and no starting branch specified.");
                return;
            }
        }

        // 6. Create new branch
        log(`Creating branch ${branchName} from ${commitToBranchFrom}...`);
        
        const finalBranchName = await findAvailableBranchName(repository, branchName);

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
        
        await fs.writeFile(patchFilePath, unidiffPatch, "utf8");

        log(`Applying patch from ${patchFilePath}...`);
        
        try {
            await new Promise<void>((resolve, reject) => {
                childProcess.execFile(
                    gitExecutable,
                    ["apply", "--3way", patchFilePath], 
                    { cwd: repository.rootUri.fsPath }, 
                    (error, stdout, stderr) => {
                        if (error) {
                            log(`Git apply failed: ${stderr || error.message}`);
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
            vscode.window.showErrorMessage(`Failed to apply patch: ${applyError.message}\nPatch file saved at: ${patchFilePath}`);
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
    const message = error instanceof Error ? error.message : String(error);
    return /branch.*not found|not found.*branch|no such branch|does not exist|unknown revision|could not find ref/i.test(message);
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
