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
