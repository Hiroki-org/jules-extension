import * as vscode from 'vscode';

export interface GitHubUrlInfo {
    owner: string;
    repo: string;
}

/**
 * GitHub URLを解析してownerとrepoを取得する
 */
export function parseGitHubUrl(url: string): GitHubUrlInfo | null {
    // HTTPS (e.g., https://github.com/owner/repo or https://github.com/owner/repo.git) and
    // SSH (e.g., git@github.com:owner/repo.git) URLs are supported.
    const regex = /(?:https?:\/\/|git@)github\.com[\/:]([^\/]+)\/([^\/]+?)(\.git)?$/;
    const match = url.match(regex);

    if (!match) {
        return null;
    }

    return {
        owner: match[1],
        repo: match[2],
    };
}
export async function createRemoteBranch(
    pat: string,
    owner: string,
    repo: string,
    branchName: string
): Promise<void> {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: pat });

    // デフォルトブランチのSHAを取得
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;
    const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`
    });
    const baseSha = refData.object.sha;

    await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseSha
    });
}

/**
 * PRのブランチ情報を表すインターフェース
 */
export interface PullRequestBranchInfo {
    /** PRのheadブランチ名 (e.g., "feature/my-branch") */
    headBranch: string;
    /** PRのbaseブランチ名 (e.g., "main") */
    baseBranch: string;
    /** headブランチが存在するリポジトリのオーナー（フォークの場合は元リポジトリと異なる） */
    headOwner: string;
    /** headブランチが存在するリポジトリ名 */
    headRepo: string;
    /** headブランチのリモートURL（clone URL） */
    headCloneUrl: string;
    /** PRの状態 ("open" | "closed" | "merged") */
    state: string;
    /** PRのタイトル */
    title: string;
}

/**
 * GitHub APIを使用してPRのブランチ情報を取得する
 * 
 * @param token GitHub OAuth アクセストークン
 * @param owner リポジトリのオーナー
 * @param repo リポジトリ名
 * @param prNumber PR番号
 * @returns PRのブランチ情報、取得失敗時はnull
 */
export async function getPullRequestBranchInfo(
    token: string,
    owner: string,
    repo: string,
    prNumber: number
): Promise<PullRequestBranchInfo | null> {
    try {
        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: token });

        const { data: pr } = await octokit.pulls.get({
            owner,
            repo,
            pull_number: prNumber
        });

        // フォークからのPRの場合、head.repoはフォーク先のリポジトリ情報を持つ
        // head.repoがnullの場合（削除されたフォーク等）はnullを返す
        if (!pr.head.repo) {
            console.warn(`[Jules] PR head repository is null (possibly deleted fork)`);
            return null;
        }

        return {
            headBranch: pr.head.ref,
            baseBranch: pr.base.ref,
            headOwner: pr.head.repo.owner.login,
            headRepo: pr.head.repo.name,
            headCloneUrl: pr.head.repo.clone_url,
            state: pr.merged ? 'merged' : pr.state,
            title: pr.title
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Jules] Failed to get PR branch info: ${msg}`);
        return null;
    }
}
