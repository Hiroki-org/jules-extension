import * as vscode from 'vscode';
import { GitHubAuth } from './githubAuth';
import { promisify } from 'util';
import { exec } from 'child_process';
import { stripUrlCredentials, sanitizeForLogging } from './securityUtils';
import { fetchWithTimeout } from './fetchUtils';

const execAsync = promisify(exec);

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

export async function getGitHubUrl(): Promise<string | undefined> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        throw new Error('Git extension not found');
      }
      const git = gitExtension.exports.getAPI(1);
      const repository = git.repositories[0];
      if (!repository) {
        throw new Error('No Git repository found');
      }
      const remote = repository.state.remotes.find(
        (r: { name: string; fetchUrl?: string; pushUrl?: string }) => r.name === 'origin'
      );
      if (!remote) {
        throw new Error('No origin remote found');
      }
      return remote.fetchUrl || remote.pushUrl;
    } catch (error) {
      console.error('Failed to get GitHub URL:', error);
      return undefined;
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

  export async function getCurrentBranchSha(outputChannel?: vscode.OutputChannel): Promise<string | null> {
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
