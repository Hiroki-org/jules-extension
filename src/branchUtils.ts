import * as vscode from "vscode";
import { JulesApiClient } from './julesApiClient';
import { Source as SourceType } from './types';
import { BranchesCache, isCacheValid } from './cache';

const DEFAULT_FALLBACK_BRANCH = 'main';

/**
 * 現在のGitブランチを取得する
 * @param outputChannel ログ出力チャンネル
 * @returns 現在のブランチ名、またはnull（Git拡張が利用できない場合など）
 */
export async function getCurrentBranch(outputChannel: vscode.OutputChannel): Promise<string | null> {
    try {
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            outputChannel.appendLine('Git extension not available');
            return null;
        }

        const git = gitExtension.exports.getAPI(1);
        if (!git) {
            outputChannel.appendLine('Git API not available');
            return null;
        }

        const repositories = git.repositories;
        if (repositories.length === 0) {
            outputChannel.appendLine('No git repositories found');
            return null;
        }

        let repository;
        if (repositories.length === 1) {
            repository = repositories[0];
        } else {
            // Multi-root workspace: let user select repository
            interface RepoItem extends vscode.QuickPickItem {
                repo: any;
            }
            const repoItems: RepoItem[] = repositories.map((repo: any, index: number) => ({
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
        outputChannel.appendLine(`[Jules] Force refreshing branches for ${sourceId}`);
    }

    outputChannel.appendLine(`[Jules] Fetching branches from API...`);

    const fetchBranchesLogic = async () => {
        let branches: string[] = [];
        let defaultBranch = DEFAULT_FALLBACK_BRANCH;
        let remoteBranches: string[] = [];

        try {
            const sourceDetail = await apiClient.getSource(selectedSource.name!);
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
            outputChannel.appendLine(`[Jules] Warning: Current branch "${currentBranch}" not found on remote`);
            branches.unshift(currentBranch);
        }

        const config = vscode.workspace.getConfiguration('jules');
        const defaultBranchConfig = config.get<string>('defaultBranch', 'current');

        let selectedDefaultBranch = defaultBranch;
        if (defaultBranchConfig === 'current' && currentBranch) {
            selectedDefaultBranch = currentBranch;
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
        await context.globalState.update(cacheKey, cache);
        outputChannel.appendLine(`[Jules] Cached ${branches.length} branches`);

        return { branches, defaultBranch: selectedDefaultBranch, currentBranch, remoteBranches };
    };

    if (showProgress) {
        return await vscode.window.withProgress(
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
