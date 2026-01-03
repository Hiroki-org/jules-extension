// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { JulesApiClient } from './julesApiClient';
import { GitHubBranch, GitHubRepo, Source as SourceType, SourcesResponse, Session, SessionResponse, SessionOutput, PRStatusCache, ActivitiesResponse, Plan, PlanStep } from './types';
import { getBranchesForSession } from './branchUtils';
import { showMessageComposer } from './composer';
import { parseGitHubUrl } from "./githubUtils";
import { GitHubAuth } from './githubAuth';
import { promisify } from 'util';
import { exec } from 'child_process';
import { mapApiStateToSessionState, getPrivacyIcon, getPrivacyStatusText, getSourceDescription, getActivityIcon, formatPlanForNotification } from './sessionUtils';
import { SessionStateManager } from './sessionState';
import { JulesSessionsProvider, SessionTreeItem } from './sessionViewProvider';
import { fetchPlanFromActivities } from './notificationUtils'; // Need this for approvePlan command logic? No, specific implementation inside approvePlan.

const execAsync = promisify(exec);
import { SourcesCache, isCacheValid } from './cache';
import { stripUrlCredentials, sanitizeForLogging } from './securityUtils';
import { fetchWithTimeout } from './fetchUtils';

// Constants
const JULES_API_BASE_URL = "https://jules.googleapis.com/v1alpha";
const VIEW_DETAILS_ACTION = 'View Details';
const SHOW_ACTIVITIES_COMMAND = 'jules-extension.showActivities';

// Plan notification display constants - moved to types/utils

// GitHub PR status cache - moved to SessionState
const PR_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

interface SourceQuickPickItem extends vscode.QuickPickItem {
  source: SourceType;
}

interface CreateSessionRequest {
  prompt: string;
  sourceContext: {
    source: string;
    githubRepoContext?: {
      startingBranch: string;
    };
  };
  automationMode: "AUTO_CREATE_PR" | "MANUAL";
  title: string;
  requirePlanApproval?: boolean;
}

// SessionOutput, Session, SessionState - moved to types.ts

// Global variables to be refactored or kept if necessary
// logChannel is needed globally for activation and some commands
let logChannel: vscode.OutputChannel = {
  name: 'Jules Logs (Fallback)',
  append: (val: string) => console.log(val),
  appendLine: (val: string) => console.log(val),
  replace: (val: string) => console.log(val),
  clear: () => { },
  show: () => { },
  hide: () => { },
  dispose: () => { }
};

// Helper functions

async function getStoredApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const apiKey = await context.secrets.get("jules-api-key");
  if (!apiKey) {
    vscode.window.showErrorMessage(
      'API Key not found. Please set it first using "Set Jules API Key" command.'
    );
    return undefined;
  }
  return apiKey;
}

async function getGitHubUrl(): Promise<string | undefined> {
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
async function getRepoInfoForBranchCreation(outputChannel?: vscode.OutputChannel): Promise<{ token: string; owner: string; repo: string } | null> {
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

async function createRemoteBranch(
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

export function buildFinalPrompt(userPrompt: string): string {
  const customPrompt = vscode.workspace
    .getConfiguration("jules-extension")
    .get<string>("customPrompt", "");
  return customPrompt ? `${userPrompt}\n\n${customPrompt}` : userPrompt;
}

// getPrivacyIcon, getPrivacyStatusText, getSourceDescription -> moved to sessionUtils.ts

function resolveSessionId(
  context: vscode.ExtensionContext,
  target?: SessionTreeItem | string
): string | undefined {
  return (
    (typeof target === "string" ? target : undefined) ??
    (target instanceof SessionTreeItem ? target.session.name : undefined) ??
    context.globalState.get<string>("active-session-id")
  );
}

// extractPRUrl, checkPRStatus, checkForCompletedSessions, checkForSessionsInState -> moved/refactored

// notifyPRCreated, fetchPlanFromActivities, formatPlanForNotification, notifyPlanAwaitingApproval, notifyUserFeedbackRequired -> moved to notificationUtils/sessionUtils

// areOutputsEqual, areSessionListsEqual, updatePreviousStates -> moved to sessionUtils/SessionStateManager

// startAutoRefresh, stopAutoRefresh, resetAutoRefresh -> moved to JulesSessionsProvider

// JulesSessionsProvider, SessionTreeItem -> moved to sessionViewProvider.ts

async function approvePlan(
  sessionId: string,
  context: vscode.ExtensionContext
): Promise<void> {
  const apiKey = await context.secrets.get("jules-api-key");
  if (!apiKey) {
    vscode.window.showErrorMessage("API Key is not set. Please set it first.");
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Approving plan...",
      },
      async () => {
        const response = await fetchWithTimeout(
          `${JULES_API_BASE_URL}/${sessionId}:approvePlan`,
          {
            method: "POST",
            headers: {
              "X-Goog-Api-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to approve plan: ${response.status} ${response.statusText}`
          );
        }

        vscode.window.showInformationMessage("Plan approved successfully!");

        // リフレッシュして最新状態を取得
        await vscode.commands.executeCommand("jules-extension.refreshSessions");
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred.";
    vscode.window.showErrorMessage(`Error approving plan: ${message}`);
  }
}

async function sendMessageToSession(
  context: vscode.ExtensionContext,
  target?: SessionTreeItem | string
): Promise<void> {
  const apiKey = await getStoredApiKey(context);
  if (!apiKey) {
    return;
  }

  const sessionId = resolveSessionId(context, target);
  if (!sessionId) {
    vscode.window.showErrorMessage(
      "No active session available. Please create or select a session first."
    );
    return;
  }

  try {
    const result = await showMessageComposer({
      title: "Send Message to Jules",
      placeholder: "What would you like Jules to do?",
    });

    if (result === undefined) {
      vscode.window.showWarningMessage("Message was cancelled and not sent.");
      return;
    }

    const userPrompt = result.prompt.trim();
    if (!userPrompt) {
      vscode.window.showWarningMessage("Message was empty and not sent.");
      return;
    }
    const finalPrompt = buildFinalPrompt(userPrompt);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Sending message to Jules...",
      },
      async () => {
        const response = await fetchWithTimeout(
          `${JULES_API_BASE_URL}/${sessionId}:sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
            },
            body: JSON.stringify({ prompt: finalPrompt }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          const message =
            errorText || `${response.status} ${response.statusText}`;
          throw new Error(message);
        }

        vscode.window.showInformationMessage("Message sent successfully!");
      }
    );

    await context.globalState.update("active-session-id", sessionId);
    await vscode.commands.executeCommand("jules-extension.refreshActivities");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred.";
    vscode.window.showErrorMessage(`Failed to send message: ${message}`);
  }
}

function updateStatusBar(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem
) {
  const selectedSource = context.globalState.get<SourceType>("selected-source");

  if (selectedSource) {
    // Extract repository name (e.g., "sources/github/owner/repo" -> "owner/repo")
    const repoMatch = selectedSource.name?.match(/sources\/github\/(.+)/);
    const repoName = repoMatch ? repoMatch[1] : selectedSource.name;

    const lockIcon = getPrivacyIcon(selectedSource.isPrivate);
    const privacyStatus = getPrivacyStatusText(selectedSource.isPrivate, 'short');
    
    statusBarItem.text = `$(repo) Jules: ${lockIcon}${repoName}`;
    statusBarItem.tooltip = `Current Source: ${repoName}${privacyStatus}\nClick to change source`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(repo) Jules: No source selected`;
    statusBarItem.tooltip = "Click to select a source";
    statusBarItem.show();
  }
}

export async function handleOpenInWebApp(item: SessionTreeItem | undefined, logChannel: vscode.OutputChannel) {
  if (!item || !(item instanceof SessionTreeItem)) {
    vscode.window.showErrorMessage("No session selected.");
    return;
  }
  const session = item.session;
  if (session.url) {
    const success = await vscode.env.openExternal(vscode.Uri.parse(session.url));
    if (!success) {
      logChannel.appendLine(`[Jules] Failed to open external URL: ${session.url}`);
      vscode.window.showWarningMessage('Failed to open the URL in the browser.');
    }
  } else {
    vscode.window.showWarningMessage(
      "No URL is available for this session."
    );
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Jules Extension is now active");

  // Create OutputChannel for Logs
  logChannel = vscode.window.createOutputChannel("Jules Extension Logs");
  context.subscriptions.push(logChannel);

  // Initialize Session State Manager
  const sessionStateManager = new SessionStateManager(context, logChannel);

  // Initialize Sessions Provider
  const sessionsProvider = new JulesSessionsProvider(context, logChannel, sessionStateManager);
  context.subscriptions.push(sessionsProvider);

  const sessionsTreeView = vscode.window.createTreeView("julesSessionsView", {
    treeDataProvider: sessionsProvider,
    showCollapseAll: false,
  });
  console.log("Jules: TreeView created");

  // ステータスバーアイテム作成
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "jules-extension.listSources";
  context.subscriptions.push(statusBarItem);

  // 初期表示を更新
  updateStatusBar(context, statusBarItem);

  // Set initial context for welcome views
  const selectedSource = context.globalState.get("selected-source");
  vscode.commands.executeCommand('setContext', 'jules-extension.hasSelectedSource', !!selectedSource);

  // Create OutputChannel for Activities
  const activitiesChannel =
    vscode.window.createOutputChannel("Jules Activities");
  context.subscriptions.push(activitiesChannel);

  // Sign in to GitHub via VS Code authentication
  const signInDisposable = vscode.commands.registerCommand('jules-extension.signInGitHub', async () => {
    const token = await GitHubAuth.signIn();
    if (token) {
      const userInfo = await GitHubAuth.getUserInfo();
      vscode.window.showInformationMessage(
        `Signed in to GitHub as ${userInfo?.login || 'user'}`
      );
      logChannel.appendLine(`[Jules] Signed in to GitHub as ${userInfo?.login}`);
    }
  });
  context.subscriptions.push(signInDisposable);

  const setApiKeyDisposable = vscode.commands.registerCommand(
    "jules-extension.setApiKey",
    async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your Jules API Key",
        password: true,
      });
      if (apiKey) {
        await context.secrets.store("jules-api-key", apiKey);
        vscode.window.showInformationMessage("API Key saved securely.");
      }
    }
  );

  const verifyApiKeyDisposable = vscode.commands.registerCommand(
    "jules-extension.verifyApiKey",
    async () => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }
      try {
        const response = await fetchWithTimeout(`${JULES_API_BASE_URL}/sources`, {
          method: "GET",
          headers: {
            "X-Goog-Api-Key": apiKey,
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          vscode.window.showInformationMessage("API Key is valid.");
        } else {
          vscode.window.showErrorMessage(
            "API Key is invalid. Please check and set a correct key."
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          "Failed to verify API Key. Please check your internet connection."
        );
      }
    }
  );

  const listSourcesDisposable = vscode.commands.registerCommand(
    "jules-extension.listSources",
    async () => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }

      sessionsProvider.setFastRefreshMode(true);
      // resetAutoRefresh handled by setFastRefreshMode

      try {
        const cacheKey = 'jules.sources';
        const cached = context.globalState.get<SourcesCache>(cacheKey);
        let sources: SourceType[];

        if (cached && isCacheValid(cached.timestamp)) {
          logChannel.appendLine('Using cached sources');
          sources = cached.sources;
        } else {
          sources = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Fetching sources...',
            cancellable: false
          }, async (progress) => {
            const response = await fetchWithTimeout(`${JULES_API_BASE_URL}/sources`, {
              method: "GET",
              headers: {
                "X-Goog-Api-Key": apiKey,
                "Content-Type": "application/json",
              },
            });
            if (!response.ok) {
              throw new Error(`Failed to fetch sources: ${response.status} ${response.statusText}`);
            }
            const data = (await response.json()) as SourcesResponse;
            if (!data.sources || !Array.isArray(data.sources)) {
              throw new Error("Invalid response format from API.");
            }
            await context.globalState.update(cacheKey, { sources: data.sources, timestamp: Date.now() });
            logChannel.appendLine(`Fetched ${data.sources.length} sources`);
            return data.sources;
          });
        }

        const items: SourceQuickPickItem[] = sources.map((source) => {
          // Extract repository name (e.g., "sources/github/owner/repo" -> "owner/repo")
          const repoMatch = source.name?.match(/sources\/github\/(.+)/);
          const repoName = repoMatch ? repoMatch[1] : (source.name || source.id || "Unknown");
          
          return {
            label: source.isPrivate === true ? `$(lock) ${repoName}` : repoName,
            description: getSourceDescription(source),
            detail: source.description || "",
            source: source,
          };
        });
        const selected: SourceQuickPickItem | undefined =
          await vscode.window.showQuickPick(items, {
            placeHolder: "Select a Jules Source",
          });
        if (selected) {
          await context.globalState.update("selected-source", selected.source);
          vscode.commands.executeCommand('setContext', 'jules-extension.hasSelectedSource', true);
          vscode.window.showInformationMessage(
            `Selected source: ${selected.label}`
          );
          updateStatusBar(context, statusBarItem);
          sessionsProvider.refresh();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred.";
        logChannel.appendLine(`Failed to list sources: ${message}`);
        vscode.window.showErrorMessage(`Failed to list sources: ${message}`);
      } finally {
        sessionsProvider.setFastRefreshMode(false);
      }
    }
  );

  const createSessionDisposable = vscode.commands.registerCommand(
    "jules-extension.createSession",
    async () => {
      const selectedSource = context.globalState.get(
        "selected-source"
      ) as SourceType;
      if (!selectedSource) {
        vscode.window.showErrorMessage(
          "No source selected. Please list and select a source first."
        );
        return;
      }
      const apiKey = await context.secrets.get("jules-api-key");
      if (!apiKey) {
        vscode.window.showErrorMessage(
          'API Key not found. Please set it first using "Set Jules API Key" command.'
        );
        return;
      }

      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

      sessionsProvider.setFastRefreshMode(true);
      try {
        // ブランチ選択ロジック（メッセージ入力前に移動）
        const { branches, defaultBranch: selectedDefaultBranch, currentBranch, remoteBranches } = await getBranchesForSession(selectedSource, apiClient, logChannel, context, { showProgress: true });

        // QuickPickでブランチ選択
        const selectedBranch = await vscode.window.showQuickPick(
          branches.map(branch => ({
            label: branch,
            picked: branch === selectedDefaultBranch,
            description: (
              branch === selectedDefaultBranch ? '(default)' : undefined
            ) || (
                branch === currentBranch ? '(current)' : undefined
              )
          })),
          {
            placeHolder: 'Select a branch for this session',
            title: 'Branch Selection'
          }
        );

        if (!selectedBranch) {
          vscode.window.showWarningMessage("Branch selection was cancelled.");
          return;
        }

        let startingBranch = selectedBranch.label;

        // リモートブランチの存在チェック
        // キャッシュが古い場合、リモートに存在するブランチが見つからないことがあるため、
        // キャッシュにないブランチが選択された場合は最新のリモートブランチを再取得する
        let currentRemoteBranches = remoteBranches;
        if (!new Set(remoteBranches).has(startingBranch)) {
          logChannel.appendLine(`[Jules] Branch "${startingBranch}" not found in cached remote branches, re-fetching...`);

          // リモートブランチを再取得（キャッシュを無視）
          const freshBranchInfo = await getBranchesForSession(selectedSource, apiClient, logChannel, context, { forceRefresh: true, showProgress: true });
          currentRemoteBranches = freshBranchInfo.remoteBranches;

          logChannel.appendLine(`[Jules] Re-fetched ${currentRemoteBranches.length} remote branches`);
        }

        if (!new Set(currentRemoteBranches).has(startingBranch)) {
          // ローカル専用ブランチの場合
          logChannel.appendLine(`[Jules] Warning: Branch "${startingBranch}" not found on remote`);

          const action = await vscode.window.showWarningMessage(
            `Branch "${startingBranch}" exists locally but has not been pushed to remote.\n\nJules requires a remote branch to start a session.`,
            { modal: true },
            'Create Remote Branch',
            'Use Default Branch'
          );

          if (action === 'Create Remote Branch') {
            const creationInfo = await getRepoInfoForBranchCreation(logChannel);
            if (!creationInfo) {
              return; // エラーメッセージはヘルパー内で表示済み
            }

            // リモートブランチを作成
            try {
              await vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: "Creating remote branch...",
                  cancellable: false,
                },
                async (progress) => {
                  progress.report({ increment: 0, message: "Initializing..." });
                  await createRemoteBranch(
                    creationInfo.token,
                    creationInfo.owner,
                    creationInfo.repo,
                    startingBranch,
                    logChannel
                  );
                  progress.report({ increment: 100, message: "Remote branch created!" });
                }
              );
              logChannel.appendLine(`[Jules] Remote branch "${startingBranch}" created successfully`);
              vscode.window.showInformationMessage(`Remote branch "${startingBranch}" created successfully.`);

              // Force refresh branches cache after remote branch creation
              try {
                await getBranchesForSession(selectedSource, apiClient, logChannel, context, { forceRefresh: true, showProgress: true });
                logChannel.appendLine('[Jules] Branches cache refreshed after remote branch creation');
              } catch (error) {
                logChannel.appendLine(`[Jules] Failed to refresh branches cache: ${error}`);
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              logChannel.appendLine(`[Jules] Failed to create remote branch: ${errorMessage}`);
              vscode.window.showErrorMessage(`Failed to create remote branch: ${errorMessage}`);
              return;
            }
          } else if (action === 'Use Default Branch') {
            startingBranch = selectedDefaultBranch;
            logChannel.appendLine(`[Jules] Using default branch: ${sanitizeForLogging(selectedDefaultBranch)}`);
          } else {
            logChannel.appendLine('[Jules] Session creation cancelled by user');
            return;
          }
        } else {
          logChannel.appendLine(`[Jules] Branch "${startingBranch}" found on remote`);
        }

        const result = await showMessageComposer({
          title: "Create Jules Session",
          placeholder: "Describe the task you want Jules to tackle...",
          showCreatePrCheckbox: true,
          showRequireApprovalCheckbox: true,
        });

        if (result === undefined) {
          vscode.window.showWarningMessage("Session creation was cancelled.");
          return;
        }

        const userPrompt = result.prompt.trim();
        if (!userPrompt) {
          vscode.window.showWarningMessage(
            "Task description was empty. Session not created."
          );
          return;
        }
        const finalPrompt = buildFinalPrompt(userPrompt);
        const title = userPrompt.split("\n")[0];
        const automationMode = result.createPR ? "AUTO_CREATE_PR" : "MANUAL";
        const requestBody: CreateSessionRequest = {
          prompt: finalPrompt,
          sourceContext: {
            source: selectedSource.name || selectedSource.id || "",
            githubRepoContext: {
              startingBranch,
            },
          },
          automationMode,
          title,
          requirePlanApproval: result.requireApproval,
        };

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Creating Jules Session...",
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              increment: 0,
              message: "Sending request...",
            });
            const response = await fetchWithTimeout(`${JULES_API_BASE_URL}/sessions`, {
              method: "POST",
              headers: {
                "X-Goog-Api-Key": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            });
            progress.report({
              increment: 50,
              message: "Processing response...",
            });
            if (!response.ok) {
              throw new Error(
                `Failed to create session: ${response.status} ${response.statusText}`
              );
            }
            const session = (await response.json()) as SessionResponse;
            await context.globalState.update("active-session-id", session.name);
            progress.report({
              increment: 100,
              message: "Session created!",
            });
            vscode.window.showInformationMessage(
              `Session created: ${session.name}`
            );
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create session: ${error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        sessionsProvider.setFastRefreshMode(false);
      }
    }
  );

  // Perform initial refresh to populate the tree view (async, don't wait)
  console.log("Jules: Starting initial refresh...");
  sessionsProvider.refresh();

  sessionsProvider.startAutoRefresh();

  const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (
        event.affectsConfiguration("jules-extension.autoRefresh.enabled") ||
        event.affectsConfiguration("jules-extension.autoRefresh.interval")
      ) {
        sessionsProvider.stopAutoRefresh();
        const autoRefreshEnabled = vscode.workspace
          .getConfiguration("jules-extension.autoRefresh")
          .get<boolean>("enabled");
        if (autoRefreshEnabled) {
          sessionsProvider.startAutoRefresh();
        }
      }
    }
  );
  context.subscriptions.push(onDidChangeConfiguration);

  const refreshSessionsDisposable = vscode.commands.registerCommand(
    "jules-extension.refreshSessions",
    () => {
      sessionsProvider.refresh(false); // Pass false for manual refresh
    }
  );

  const showActivitiesDisposable = vscode.commands.registerCommand(
    "jules-extension.showActivities",
    async (sessionId: string) => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }
      try {
        const sessionResponse = await fetchWithTimeout(
          `${JULES_API_BASE_URL}/${sessionId}`,
          {
            method: "GET",
            headers: {
              "X-Goog-Api-Key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );
        if (!sessionResponse.ok) {
          const errorText = await sessionResponse.text();
          vscode.window.showErrorMessage(
            `Session not found: ${sessionResponse.status} ${sessionResponse.statusText} - ${errorText}`
          );
          return;
        }
        const session = (await sessionResponse.json()) as Session;
        const response = await fetchWithTimeout(
          `${JULES_API_BASE_URL}/${sessionId}/activities`,
          {
            method: "GET",
            headers: {
              "X-Goog-Api-Key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );
        if (!response.ok) {
          const errorText = await response.text();
          vscode.window.showErrorMessage(
            `Failed to fetch activities: ${response.status} ${response.statusText} - ${errorText}`
          );
          return;
        }
        const data = (await response.json()) as ActivitiesResponse;
        if (!data.activities || !Array.isArray(data.activities)) {
          vscode.window.showErrorMessage("Invalid response format from API.");
          return;
        }
        activitiesChannel.clear();
        activitiesChannel.show();
        activitiesChannel.appendLine(`Activities for session: ${sessionId}`);
        activitiesChannel.appendLine("---");
        if (data.activities.length === 0) {
          activitiesChannel.appendLine("No activities found for this session.");
        } else {
          let planDetected = false;
          data.activities.forEach((activity) => {
            const icon = getActivityIcon(activity);
            const timestamp = new Date(activity.createTime).toLocaleString();
            let message = "";
            if (activity.planGenerated) {
              message = `Plan generated: ${activity.planGenerated.plan?.title || "Plan"
                }`;
              planDetected = true;
            } else if (activity.planApproved) {
              message = `Plan approved: ${activity.planApproved.planId}`;
            } else if (activity.progressUpdated) {
              message = `Progress: ${activity.progressUpdated.title}${activity.progressUpdated.description
                ? " - " + activity.progressUpdated.description
                : ""
                }`;
            } else if (activity.sessionCompleted) {
              message = "Session completed";
            } else {
              message = "Unknown activity";
            }
            activitiesChannel.appendLine(
              `${icon} ${timestamp} (${activity.originator}): ${message}`
            );
          });
        }
        await context.globalState.update("active-session-id", sessionId);
      } catch (error) {
        vscode.window.showErrorMessage(
          "Failed to fetch activities. Please check your internet connection."
        );
      }
    }
  );

  const refreshActivitiesDisposable = vscode.commands.registerCommand(
    "jules-extension.refreshActivities",
    async () => {
      const currentSessionId = context.globalState.get(
        "active-session-id"
      ) as string;
      if (!currentSessionId) {
        vscode.window.showErrorMessage(
          "No current session selected. Please show activities first."
        );
        return;
      }
      await vscode.commands.executeCommand(
        "jules-extension.showActivities",
        currentSessionId
      );
    }
  );

  const sendMessageDisposable = vscode.commands.registerCommand(
    "jules-extension.sendMessage",
    async (item?: SessionTreeItem | string) => {
      await sendMessageToSession(context, item);
    }
  );

  const approvePlanDisposable = vscode.commands.registerCommand(
    "jules-extension.approvePlan",
    async (targetSessionId?: string) => {
      const sessionId = targetSessionId || context.globalState.get<string>("active-session-id");
      if (!sessionId) {
        vscode.window.showErrorMessage(
          "No active session. Please select a session first."
        );
        return;
      }
      await approvePlan(sessionId, context);
    }
  );

  const openSettingsDisposable = vscode.commands.registerCommand(
    "jules-extension.openSettings",
    () => {
      return vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:HirokiMukai.jules-extension"
      );
    }
  );

  const deleteSessionDisposable = vscode.commands.registerCommand(
    "jules-extension.deleteSession",
    async (item?: SessionTreeItem) => {
      if (!item || !(item instanceof SessionTreeItem)) {
        vscode.window.showErrorMessage("No session selected.");
        return;
      }

      const session = item.session;
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete session "${session.title}" from local cache?\n\nNote: this only removes it locally and does not delete the session on Jules server.`,
        { modal: true },
        "Delete"
      );

      if (confirm !== "Delete") {
        return;
      }

      // Remove from previous states to hide it
      await sessionStateManager.deleteSession(session.name);

      vscode.window.showInformationMessage(
        `Session "${session.title}" removed from local cache.`
      );

      // Refresh the view
      sessionsProvider.refresh();
    }
  );

  const setGithubTokenDisposable = vscode.commands.registerCommand(
    "jules-extension.setGithubToken",
    async () => {
      try {
        const token = await vscode.window.showInputBox({
          prompt:
            "Enter your GitHub Personal Access Token (used for PR status checks)",
          password: true,
          placeHolder: "Enter your GitHub PAT",
          ignoreFocusOut: true,
        });

        if (token === undefined) {
          // User cancelled the input
          console.log("Jules: GitHub Token input cancelled by user");
          return;
        }

        if (token === "") {
          vscode.window.showWarningMessage(
            "GitHub token was empty — cancelled."
          );
          return;
        }

        // Validate token format
        if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
          const proceed = await vscode.window.showWarningMessage(
            "The token you entered doesn't look like a typical GitHub token. Save anyway?",
            { modal: true },
            "Save",
            "Cancel"
          );
          if (proceed !== "Save") {
            return;
          }
        }

        await context.secrets.store("jules-github-token", token);
        vscode.window.showInformationMessage(
          "GitHub token saved securely."
        );
        // Clear PR status cache when token changes
        sessionStateManager.clearPRStatusCache();
        sessionsProvider.refresh();
      } catch (error) {
        console.error("Jules: Error setting GitHub Token:", error);
        vscode.window.showErrorMessage(
          `GitHub Token の保存に失敗しました: ${error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
  );

  const setGitHubPatDisposable = vscode.commands.registerCommand(
    "jules-extension.setGitHubPat",
    async () => {
      // Deprecation warning — suggest OAuth sign-in instead of PAT
      const proceed = await vscode.window.showWarningMessage(
        'GitHub PAT is deprecated and will be removed in a future version.\n\nPlease use OAuth sign-in instead.',
        'Use OAuth (Recommended)',
        'Continue with PAT'
      );

      if (proceed === 'Use OAuth (Recommended)') {
        await vscode.commands.executeCommand('jules-extension.signInGitHub');
        return;
      }

      if (proceed !== 'Continue with PAT') {
        return; // user cancelled
      }
      const pat = await vscode.window.showInputBox({
        prompt: '[DEPRECATED] Enter GitHub Personal Access Token',
        password: true,
        placeHolder: 'Enter your GitHub PAT',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'PAT cannot be empty';
          }

          // 厳格なフォーマットチェック
          const ghpPattern = /^ghp_[A-Za-z0-9]{36}$/;
          const githubPatPattern = /^github_pat_[A-Za-z0-9_]{82}$/;

          if (!ghpPattern.test(value) && !githubPatPattern.test(value)) {
            return 'Invalid PAT format. Please enter a valid GitHub Personal Access Token.';
          }

          return null;
        }
      });

      if (pat) {
        // 追加の検証（validateInputが通った場合でも再チェック）
        const ghpPattern = /^ghp_[A-Za-z0-9]{36}$/;
        const githubPatPattern = /^github_pat_[A-Za-z0-9_]{82}$/;
        if (ghpPattern.test(pat) || githubPatPattern.test(pat)) {
          await context.secrets.store('jules-github-pat', pat);
          vscode.window.showInformationMessage('GitHub PAT saved (deprecated)');
          logChannel.appendLine('[Jules] GitHub PAT saved (deprecated)');
        } else {
          vscode.window.showErrorMessage('Invalid PAT format. PAT was not saved.');
        }
      }
    }
  );

  const clearCacheDisposable = vscode.commands.registerCommand(
    "jules-extension.clearCache",
    async () => {
      try {
        // すべてのキーを取得
        const allKeys = context.globalState.keys();

        // Sources & Branches キャッシュをフィルタ
        const branchCacheKeys = allKeys.filter(key => key.startsWith('jules.branches.'));
        const cacheKeys = ['jules.sources', ...branchCacheKeys];

        // すべてのキャッシュをクリア
        await Promise.all(
          cacheKeys.map(key => context.globalState.update(key, undefined))
        );

        vscode.window.showInformationMessage(`Jules cache cleared: ${cacheKeys.length} entries removed`);
        logChannel.appendLine(`[Jules] Cache cleared: ${cacheKeys.length} entries (1 sources + ${branchCacheKeys.length} branches)`);
      } catch (error: any) {
        logChannel.appendLine(`[Jules] Error clearing cache: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to clear cache: ${error.message}`);
      }
    }
  );

  const openInWebAppDisposable = vscode.commands.registerCommand(
    "jules-extension.openInWebApp",
    (item?: SessionTreeItem) => handleOpenInWebApp(item, logChannel)
  );
  context.subscriptions.push(
    setApiKeyDisposable,
    verifyApiKeyDisposable,
    listSourcesDisposable,
    createSessionDisposable,
    sessionsTreeView,
    refreshSessionsDisposable,
    showActivitiesDisposable,
    refreshActivitiesDisposable,
    sendMessageDisposable,
    approvePlanDisposable,
    openSettingsDisposable,
    deleteSessionDisposable,
    setGithubTokenDisposable,
    setGitHubPatDisposable,
    clearCacheDisposable,
    openInWebAppDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  // auto refresh is stopped in dispose or context lifecycle?
  // We can't easily access sessionProvider here unless we store it globally or in a WeakMap.
  // But typically extensions are disposed properly.
  // The provider has stopAutoRefresh method, but we don't have reference here.
  // It's acceptable for deactivate to be empty if disposables handle cleanup.
  // clearInterval will be handled if the provider is disposed? No, provider is not disposable by default.
  // Let's rely on Node.js/VS Code process cleanup, or better: make Provider disposable.
}
