import * as vscode from "vscode";
import { promisify } from 'util';
import { exec } from 'child_process';
import { JulesApiClient } from './julesApiClient';
import { Source as SourceType } from './types';
import { BranchesCache, isCacheValid } from './cache';
import { parseGitHubUrl } from './githubUtils';
import { stripUrlCredentials, sanitizeForLogging } from './securityUtils';
import { GitHubAuth } from './githubAuth';
import { fetchWithTimeout } from './fetchUtils';

const execAsync = promisify(exec);

const DEFAULT_FALLBACK_BRANCH = 'main';
const BRANCH_CACHE_TIMESTAMP_REFRESH_THRESHOLD_MS = 3 * 60 * 1000;

async function getActiveRepository(outputChannel: vscode.OutputChannel): Promise<any | null> {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
        outputChannel.appendLine('Git extension not available');
        return null;
    }

    const git = gitExtension.exports.getAPI(1);
    if (!git || git.repositories.length === 0) {
        outputChannel.appendLine('No git repositories found');
        return null;
    }

    let repository;
    if (git.repositories.length === 1) {
        repository = git.repositories[0];
    } else {
        // Multi-root workspace: let user select repository
        interface RepoItem extends vscode.QuickPickItem {
            repo: any;
        }
        const repoItems: RepoItem[] = git.repositories.map((repo: any, index: number) => ({
            label: repo.rootUri.fsPath.split('/').pop() || `Repository ${index + 1}`,
            description: repo.rootUri.fsPath,
            repo
        }));
        const selected = await vscode.window.showQuickPick(repoItems, {
            placeHolder: 'Select a Git repository'
        });
        if (!selected) {
            outputChannel.appendLine('No repository selected');
            return null;
        }
        repository = selected.repo;
    }

    return repository;
}

/**
 * 現在のGitブランチを取得する
 * @param outputChannel ログ出力チャンネル
 * @returns 現在のブランチ名、またはnull（Git拡張が利用できない場合など）
 */
export async function getCurrentBranch(outputChannel: vscode.OutputChannel): Promise<string | null> {
    try {
        const repository = await getActiveRepository(outputChannel);
        if (!repository) {
            return null;
        }

        const head = repository.state.HEAD;
        if (!head) {
            outputChannel.appendLine('No HEAD found');
            return null;
        }

        return head.name || null;
    } catch (error) {
        outputChannel.appendLine(`Error getting current branch: ${error}`);
        return null;
    }
}

async function getCurrentBranchSha(outputChannel?: vscode.OutputChannel): Promise<string | null> {
    const logger = outputChannel ?? { appendLine: (s: string) => console.log(s) } as vscode.OutputChannel;
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        const { stdout } = await execAsync('git rev-parse HEAD', {
            cwd: workspaceFolder.uri.fsPath
        });

        return stdout.trim();
    } catch (error) {
        logger.appendLine(`[Jules] Error getting current branch sha: ${error}`);
        return null;
    }
}

/**
 * リモートブランチ作成に必要なリポジトリ情報を取得
 */
export async function getRepoInfoForBranchCreation(outputChannel?: vscode.OutputChannel): Promise<{ token: string; owner: string; repo: string } | null> {
    const logger = outputChannel ?? { appendLine: (s: string) => console.log(s) } as vscode.OutputChannel;
    const token = await GitHubAuth.getToken();

    if (!token) {
        const action = await vscode.window.showInformationMessage(
            'Sign in to GitHub to create remote branch',
            'Sign In',
            'Cancel'
        );

        if (action === 'Sign In') {
            const newToken = await GitHubAuth.signIn();
            if (!newToken) {
                return null;
            }
            return getRepoInfoForBranchCreation(outputChannel);
        }
        return null;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return null;
    }

    try {
        const { stdout } = await execAsync('git remote get-url origin', {
            cwd: workspaceFolder.uri.fsPath
        });

        const remoteUrl = stdout.trim();
        const safeRemoteUrl = stripUrlCredentials(remoteUrl);
        logger.appendLine(`[Jules] Remote URL: ${safeRemoteUrl}`);

        // Prefer the shared parser which handles https/ssh and .git suffixes
        const repoInfo = parseGitHubUrl(safeRemoteUrl);
        if (!repoInfo) {
            vscode.window.showErrorMessage('Could not parse GitHub repository URL');
            return null;
        }
        const { owner, repo } = repoInfo;
        logger.appendLine(`[Jules] Repository: ${owner}/${repo}`);

        return { token, owner, repo };
    } catch (error: any) {
        logger.appendLine(`[Jules] Error getting repo info: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to get repository info: ${error.message}`);
        return null;
    }
}

export async function createRemoteBranch(
    token: string,
    owner: string,
    repo: string,
    branchName: string,
    outputChannel?: vscode.OutputChannel
): Promise<void> {
    const logger = outputChannel ?? { appendLine: (s: string) => console.log(s) } as vscode.OutputChannel;
    try {
        logger.appendLine('[Jules] Getting current branch SHA...');
        const sha = await getCurrentBranchSha(outputChannel);

        if (!sha) {
            throw new Error('Failed to get current branch SHA');
        }

        logger.appendLine(`[Jules] Current branch SHA: ${sha}`);
        logger.appendLine(`[Jules] Creating remote branch: ${branchName}`);

        const response = await fetchWithTimeout(
            `https://api.github.com/repos/${owner}/${repo}/git/refs`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ref: `refs/heads/${branchName}`,
                    sha: sha
                })
            }
        );

        if (!response.ok) {
            // Read the response as text so we can handle non-JSON errors robustly
            const respText = await response.text();
            logger.appendLine(`[Jules] GitHub API error response: ${sanitizeForLogging(respText)}`);
            let errMsg = 'Unknown error';
            try {
                const parsed = JSON.parse(respText);
                errMsg = parsed?.message || JSON.stringify(parsed);
            } catch (e) {
                errMsg = respText;
            }
            throw new Error(`GitHub API error: ${response.status} - ${errMsg}`);
        }

        const result: any = await response.json().catch(() => null);
        logger.appendLine(`[Jules] Remote branch created: ${result?.ref ?? 'unknown'}`);
    } catch (error: any) {
        logger.appendLine(`[Jules] Failed to create remote branch: ${error.message}`);
        throw error;
    }
}

async function getWorkspaceGitHubRepo(outputChannel: vscode.OutputChannel): Promise<{ owner: string; repo: string } | null> {
    try {
        const repository = await getActiveRepository(outputChannel);
        if (!repository) {
            return null;
        }

        const remote = repository.state.remotes.find((r: any) => r.name === 'origin');
        if (!remote) {
            outputChannel.appendLine('No origin remote found');
            return null;
        }

        const remoteUrl = remote.fetchUrl || remote.pushUrl;
        if (!remoteUrl) {
            outputChannel.appendLine('No remote URL found for origin');
            return null;
        }

        const parsed = parseGitHubUrl(remoteUrl);
        if (!parsed) {
            outputChannel.appendLine('Failed to parse GitHub remote URL');
            return null;
        }

        return { owner: parsed.owner.toLowerCase(), repo: parsed.repo.toLowerCase() };
    } catch (error) {
        outputChannel.appendLine(`Error getting workspace GitHub repo: ${error}`);
        return null;
    }
}

function areArraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function areCacheContentsEqual(a: BranchesCache, b: BranchesCache): boolean {
    if (a.defaultBranch !== b.defaultBranch) {
        return false;
    }
    if (a.currentBranch !== b.currentBranch) {
        return false;
    }
    if (!areArraysEqual(a.branches, b.branches)) {
        return false;
    }
    if (!areArraysEqual(a.remoteBranches, b.remoteBranches)) {
        return false;
    }
    return true;
}

/**
 * セッション作成時のブランチ選択に必要な情報を取得する
 * @param selectedSource 選択されたソース
 * @param apiClient APIクライアント
 * @param outputChannel ログ出力チャンネル
 * @param context VS Code拡張コンテキスト
 * @returns ブランチリスト、デフォルトブランチ、現在のブランチ、リモートブランチ
 */
export async function getBranchesForSession(
    selectedSource: SourceType,
    apiClient: JulesApiClient,
    outputChannel: vscode.OutputChannel,
    context: vscode.ExtensionContext,
    options: { forceRefresh?: boolean, showProgress?: boolean } = {}
): Promise<{
    branches: string[];
    defaultBranch: string;
    currentBranch: string | null;
    remoteBranches: string[];
}> {
    const sourceId = selectedSource.name || selectedSource.id || '';
    const cacheKey = `jules.branches.${sourceId}`;
    const { forceRefresh = false, showProgress = true } = options;

    // キャッシュチェック（簡潔なログ）
    if (!forceRefresh) {
        const cached = context.globalState.get<BranchesCache>(cacheKey);

        if (cached && isCacheValid(cached.timestamp)) {
            outputChannel.appendLine(`[Jules] Using cached branches (${cached.branches.length} branches, last updated: ${new Date(cached.timestamp).toLocaleString()})`);
            return {
                branches: cached.branches,
                defaultBranch: cached.defaultBranch,
                currentBranch: cached.currentBranch,
                remoteBranches: cached.remoteBranches
            };
        }
    } else {
        outputChannel.appendLine(`[Jules] Force refreshing branches for ${sanitizeForLogging(sourceId)}`);
    }

    outputChannel.appendLine(`[Jules] Fetching branches from API...`);

    const fetchBranchesLogic = async () => {
        let branches: string[] = [];
        let defaultBranch = DEFAULT_FALLBACK_BRANCH;
        let remoteBranches: string[] = [];

        try {
            const sourceName = selectedSource.name;
            if (!sourceName) {
                throw new Error("Selected source is missing a name.");
            }
            const sourceDetail = await apiClient.getSource(sourceName);
            if (sourceDetail.githubRepo?.branches) {
                remoteBranches = sourceDetail.githubRepo.branches.map(b => b.displayName);
                branches = [...remoteBranches];
                defaultBranch = sourceDetail.githubRepo.defaultBranch?.displayName || DEFAULT_FALLBACK_BRANCH;
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[Jules] Failed to get branches: ${msg}`);
            branches = [defaultBranch];
        }

        const currentBranch = await getCurrentBranch(outputChannel);

        // 警告は1回だけ
        if (currentBranch && !remoteBranches.includes(currentBranch)) {
            outputChannel.appendLine(`[Jules] Warning: Current branch "${sanitizeForLogging(currentBranch)}" not found on remote`);
            branches.unshift(currentBranch);
        }

        const config = vscode.workspace.getConfiguration('jules');
        const defaultBranchConfig = config.get<string>('defaultBranch', 'current');

        let selectedDefaultBranch = defaultBranch;
        if (defaultBranchConfig === 'current' && currentBranch) {
            const workspaceRepo = await getWorkspaceGitHubRepo(outputChannel);
            const sourceRepo = selectedSource.githubRepo;
            const isRepoMatched = workspaceRepo && sourceRepo &&
                workspaceRepo.owner === sourceRepo.owner.toLowerCase() &&
                workspaceRepo.repo === sourceRepo.repo.toLowerCase();

            if (isRepoMatched) {
                selectedDefaultBranch = currentBranch;
            }
        } else if (defaultBranchConfig === 'main') {
            selectedDefaultBranch = branches.includes('main') ? 'main' : defaultBranch;
        }

        const cache: BranchesCache = {
            branches,
            defaultBranch: selectedDefaultBranch,
            remoteBranches,
            currentBranch,
            timestamp: Date.now()
        };

        const existingCache = context.globalState.get<BranchesCache>(cacheKey);
        let shouldUpdate = true;

        if (existingCache && areCacheContentsEqual(existingCache, cache)) {
            // Data hasn't changed.
            // Check if we need to refresh timestamp
            const age = cache.timestamp - existingCache.timestamp;

            if (age < BRANCH_CACHE_TIMESTAMP_REFRESH_THRESHOLD_MS) {
                shouldUpdate = false;
                outputChannel.appendLine(`[Jules] Branch cache unchanged and fresh (age: ${Math.round(age / 1000)}s), skipping write.`);
            } else {
                outputChannel.appendLine(`[Jules] Branch cache unchanged but aging, refreshing timestamp.`);
            }
        }

        if (shouldUpdate) {
            await context.globalState.update(cacheKey, cache);
            outputChannel.appendLine(`[Jules] Cached ${branches.length} branches`);
        }

        return { branches, defaultBranch: selectedDefaultBranch, currentBranch, remoteBranches };
    };

    if (showProgress) {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Loading branches...",
                cancellable: false
            },
            fetchBranchesLogic
        );
    } else {
        return fetchBranchesLogic();
    }
}
