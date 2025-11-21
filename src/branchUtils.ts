import * as vscode from "vscode";
import { JulesApiClient } from './julesApiClient';
import { Source as SourceType } from './types';

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
 * @returns ブランチリスト、デフォルトブランチ、現在のブランチ、リモートブランチ
 */
export async function getBranchesForSession(
    selectedSource: SourceType,
    apiClient: JulesApiClient,
    outputChannel: vscode.OutputChannel
): Promise<{ branches: string[]; defaultBranch: string; currentBranch: string | null; remoteBranches: string[] }> {
    let branches: string[] = [];
    let defaultBranch = DEFAULT_FALLBACK_BRANCH;
    let remoteBranches: string[] = [];

    try {
        const sourceDetail = await apiClient.getSource(selectedSource.name!);
        if (sourceDetail.githubRepo?.branches) {
            remoteBranches = sourceDetail.githubRepo.branches.map(b => b.displayName);
            branches = [...remoteBranches];  // リモートブランチをベースに
            defaultBranch = sourceDetail.githubRepo.defaultBranch?.displayName || DEFAULT_FALLBACK_BRANCH;
        }
    } catch (error) {
        outputChannel.appendLine(`Failed to get branches, using default: ${error}`);
        branches = [defaultBranch];
    }

    // 現在のブランチを取得
    const currentBranch = await getCurrentBranch(outputChannel);

    // 設定からデフォルトブランチ選択を取得
    const config = vscode.workspace.getConfiguration('jules');
    const defaultBranchSetting = config.get<string>('defaultBranch', 'current');

    // 設定に基づいてデフォルトブランチを決定
    let selectedDefaultBranch = defaultBranch;
    if (defaultBranchSetting === 'current' && currentBranch) {
        selectedDefaultBranch = currentBranch;
    } else if (defaultBranchSetting === 'main') {
        selectedDefaultBranch = 'main';
    } // 'default' の場合はAPIから取得したdefaultBranchを使用

    // 現在のブランチをブランチリストの先頭に追加（まだない場合）
    if (currentBranch && !branches.includes(currentBranch)) {
        branches.unshift(currentBranch);
    }

    return { branches, defaultBranch: selectedDefaultBranch, currentBranch, remoteBranches };
}