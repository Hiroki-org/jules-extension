import * as vscode from 'vscode';
import { JULES_API_BASE_URL } from './constants';
import { JulesApiClient } from './julesApiClient';
import { SessionManager } from './sessionManager';
import { PollingManager } from './polling';
import { JulesSessionsProvider, SessionTreeItem } from './treeView';
import { getBranchesForSession } from './branchUtils';
import { getRepoInfoForBranchCreation, createRemoteBranch } from './gitHelpers';
import { showMessageComposer } from './composer';
import { GitHubAuth } from './githubAuth';
import {
  Source as SourceType,
  Session,
  LocalSession,
  Activity,
  CreateSessionRequest,
  SessionResponse,
  SourcesResponse,
  PlanStep,
  PlanGenerated,
  ActivitiesResponse
} from './types';
import { SourcesCache, isCacheValid } from './cache';

// Helper to get API Key
async function getStoredApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const apiKey = await context.secrets.get("jules-api-key");
  if (!apiKey) {
    vscode.window.showErrorMessage(
      'API Key not found. Please set it first using "Set Jules API Key" command.'
    );
    return undefined;
  }
  return apiKey;
}

// Helper to update status bar
function updateStatusBar(context: vscode.ExtensionContext, statusBarItem: vscode.StatusBarItem) {
  const selectedSource = context.globalState.get("selected-source") as SourceType;
  if (selectedSource) {
    // Extract repo name if possible
    const repoMatch = selectedSource.name?.match(/sources\/github\/(.+)/);
    const repoName = repoMatch ? repoMatch[1] : selectedSource.name;

    statusBarItem.text = `$(repo) Jules: ${repoName || selectedSource.id}`;
    statusBarItem.tooltip = `Selected Source: ${selectedSource.name || selectedSource.id}\nURL: ${selectedSource.url || "N/A"}`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(repo) Jules: No source selected`;
    statusBarItem.tooltip = "Click to select a source";
    statusBarItem.show();
  }
}

// Helper to build final prompt
export function buildFinalPrompt(userPrompt: string): string {
  const config = vscode.workspace.getConfiguration("jules-extension");
  const customPrompt = (config.get<string>("customPrompt") || "").trim();
  if (customPrompt) {
    return `${customPrompt}\n\n${userPrompt}`;
  }
  return userPrompt;
}

export function mapApiStateToSessionState(apiState: string): Session['state'] {
  switch (apiState) {
    case 'COMPLETED': return 'COMPLETED';
    case 'FAILED': return 'FAILED';
    case 'CANCELLED': return 'CANCELLED';
    case 'PAUSED': return 'CANCELLED';
    case 'AWAITING_PLAN_APPROVAL': return 'RUNNING';
    default: return 'RUNNING';
  }
}

// Helper to get activity icon
function getActivityIcon(activity: Activity): string {
  if (activity.planGenerated) return "📝";
  if (activity.planApproved) return "✅";
  if (activity.progressUpdated) return "🔄";
  if (activity.sessionCompleted) return "🏁";
  if (activity.originator === "user") return "👤";
  return "🤖";
}

export async function notifyPlanAwaitingApproval(
  session: LocalSession,
  plan: PlanGenerated,
  context: vscode.ExtensionContext,
  sessionsProvider: JulesSessionsProvider
) {
  // Check if we already notified for this plan
  const alreadyNotifiedKey = `notified-plan-${plan.id}`;
  const alreadyNotified = context.globalState.get<boolean>(alreadyNotifiedKey);

  if (!alreadyNotified) {
    // Find the user request that triggered this plan
    // We look for the latest user activity before the plan
    let userRequestContent = "";
    if (session.activities) {
      const planTime = new Date(plan.createTime).getTime();
      const userActivities = session.activities.filter(a =>
        a.originator === "user" &&
        new Date(a.createTime).getTime() < planTime
      );
      // Sort by time descending
      userActivities.sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime());

      if (userActivities.length > 0) {
        // Assuming description holds the prompt/message
        userRequestContent = userActivities[0].description || "No content";
      }
    }

    let message = `Session "${session.title}" is awaiting plan approval.`;
    if (userRequestContent) {
      // Truncate if too long
      const truncatedRequest = userRequestContent.length > 100 ? userRequestContent.substring(0, 100) + "..." : userRequestContent;
      message += `\nRequest: "${truncatedRequest}"`;
    }

    const action = await vscode.window.showInformationMessage(
      message,
      "View Session",
      "Approve Plan"
    );

    if (action === "View Session") {
      vscode.commands.executeCommand("jules-extension.showActivities", session.name);
    } else if (action === "Approve Plan") {
      vscode.commands.executeCommand("jules-extension.approvePlan", session.name);
    }

    await context.globalState.update(alreadyNotifiedKey, true);
  }

  // Refresh the tree view
  sessionsProvider.refresh();
}

export async function sessionSelectedHandler(session: LocalSession) {
  if (!session) return;
  if (session.rawState === "AWAITING_PLAN_APPROVAL") {
    // Trigger showActivities which handles plan approval prompt
    vscode.commands.executeCommand("jules-extension.showActivities", session.name);
  } else {
    vscode.commands.executeCommand("jules-extension.showActivities", session.name);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const logChannel = vscode.window.createOutputChannel("Jules Extension Logs");
  context.subscriptions.push(logChannel);
  logChannel.appendLine("Jules Extension is now active!");

  const activitiesChannel = vscode.window.createOutputChannel("Jules Activities");
  context.subscriptions.push(activitiesChannel);

  const sessionManager = new SessionManager(context, logChannel);
  const sessionsProvider = new JulesSessionsProvider(sessionManager);

  // Initialize PollingManager
  const pollingManager = new PollingManager(
    context,
    sessionManager,
    logChannel,
    async (session: LocalSession, plan: PlanGenerated) => {
      await notifyPlanAwaitingApproval(session, plan, context, sessionsProvider);
    }
  );

  vscode.window.registerTreeDataProvider("julesSessionsView", sessionsProvider);

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "jules-extension.listSources";
  context.subscriptions.push(statusBarItem);
  updateStatusBar(context, statusBarItem);

  // Command: Set API Key
  const setApiKeyDisposable = vscode.commands.registerCommand(
    "jules-extension.setApiKey",
    async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your Jules API Key",
        password: true,
        ignoreFocusOut: true,
      });

      if (apiKey) {
        await context.secrets.store("jules-api-key", apiKey);
        vscode.window.showInformationMessage("API Key saved successfully.");

        // Verify API Key
        try {
          const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);
          await apiClient.listSources(); // Simple call to verify
          vscode.window.showInformationMessage("API Key is valid.");
        } catch (error) {
          vscode.window.showErrorMessage("API Key is invalid or network error.");
        }
      }
    }
  );

  // Command: List Sources
  const listSourcesDisposable = vscode.commands.registerCommand(
    "jules-extension.listSources",
    async () => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) return;

      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

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
          }, async () => {
            return await apiClient.listSources();
          });
          await context.globalState.update(cacheKey, { sources, timestamp: Date.now() });
        }

        const items = sources.map((source) => ({
          label: source.name || source.id || "Unknown",
          description: source.url || "",
          detail: source.description || "",
          source: source,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "Select a Jules Source",
        });

        if (selected) {
          await context.globalState.update("selected-source", selected.source);
          vscode.window.showInformationMessage(`Selected source: ${selected.label}`);
          updateStatusBar(context, statusBarItem);
          sessionsProvider.refresh();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred.";
        vscode.window.showErrorMessage(`Failed to list sources: ${message}`);
      }
    }
  );

  // Command: Create Session
  const createSessionDisposable = vscode.commands.registerCommand(
    "jules-extension.createSession",
    async () => {
      const selectedSource = context.globalState.get("selected-source") as SourceType;
      if (!selectedSource) {
        vscode.window.showErrorMessage("No source selected. Please list and select a source first.");
        return;
      }
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) return;

      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

      try {
        const { branches, defaultBranch, currentBranch, remoteBranches } = await getBranchesForSession(
          selectedSource,
          apiClient,
          logChannel,
          context
        );

        const selectedBranch = await vscode.window.showQuickPick(
          branches.map(branch => ({
            label: branch,
            picked: branch === defaultBranch,
            description: (branch === defaultBranch ? '(default)' : undefined) ||
              (branch === currentBranch ? '(current)' : undefined)
          })),
          { placeHolder: 'Select a branch for this session', title: 'Branch Selection' }
        );

        if (!selectedBranch) return;

        let startingBranch = selectedBranch.label;

        // Check if remote branch exists
        if (!new Set(remoteBranches).has(startingBranch)) {
          const action = await vscode.window.showWarningMessage(
            `Branch "${startingBranch}" exists locally but has not been pushed to remote.`,
            { modal: true },
            'Create Remote Branch',
            'Use Default Branch'
          );

          if (action === 'Create Remote Branch') {
            const creationInfo = await getRepoInfoForBranchCreation(logChannel);
            if (creationInfo) {
              await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Creating remote branch...",
              }, async () => {
                await createRemoteBranch(
                  creationInfo.token,
                  creationInfo.owner,
                  creationInfo.repo,
                  startingBranch,
                  logChannel
                );
              });
              // Refresh branches
              await getBranchesForSession(selectedSource, apiClient, logChannel, context, true);
            } else {
              return;
            }
          } else if (action === 'Use Default Branch') {
            startingBranch = defaultBranch;
          } else {
            return;
          }
        }

        const result = await showMessageComposer({
          title: "Create Jules Session",
          placeholder: "Describe the task you want Jules to tackle...",
          showCreatePrCheckbox: true,
          showRequireApprovalCheckbox: true,
        });

        if (!result) return;

        const userPrompt = result.prompt.trim();
        if (!userPrompt) return;

        const finalPrompt = buildFinalPrompt(userPrompt);
        const title = userPrompt.split("\n")[0];
        const automationMode = result.createPR ? "AUTO_CREATE_PR" : "MANUAL";

        const requestBody: CreateSessionRequest = {
          prompt: finalPrompt,
          sourceContext: {
            source: selectedSource.name || selectedSource.id || "",
            githubRepoContext: { startingBranch },
          },
          automationMode,
          title,
          requirePlanApproval: result.requireApproval,
        };

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Creating Jules Session...",
        }, async () => {
          const sessionResponse = await apiClient.createSession(requestBody);

          // Create LocalSession object
          const newSession: LocalSession = {
            name: sessionResponse.name,
            title: title,
            state: "RUNNING",
            rawState: "RUNNING",
            requirePlanApproval: result.requireApproval,
            activities: []
          };

          await sessionManager.addSession(newSession);
          await context.globalState.update("active-session-id", newSession.name);
          vscode.window.showInformationMessage(`Session created: ${newSession.name}`);
          sessionsProvider.refresh();
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode.window.showErrorMessage(`Failed to create session: ${message}`);
      }
    }
  );

  // Command: Refresh Sessions
  const refreshSessionsDisposable = vscode.commands.registerCommand(
    "jules-extension.refreshSessions",
    () => {
      sessionsProvider.refresh();
    }
  );

  // Command: Show Activities
  const showActivitiesDisposable = vscode.commands.registerCommand(
    "jules-extension.showActivities",
    async (sessionId: string) => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) return;

      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

      try {
        const session = await apiClient.getSession(sessionId);
        const activities = await apiClient.getActivities(sessionId);

        activitiesChannel.clear();
        activitiesChannel.show();
        activitiesChannel.appendLine(`Activities for session: ${sessionId}`);
        activitiesChannel.appendLine("---");

        if (activities.length === 0) {
          activitiesChannel.appendLine("No activities found for this session.");
        } else {
          activities.forEach((activity) => {
            const icon = getActivityIcon(activity);
            const timestamp = new Date(activity.createTime).toLocaleString();
            let message = "";
            if (activity.planGenerated) {
              const count = Array.isArray(activity.planGenerated.steps)
                ? activity.planGenerated.steps.length
                : 0;
              message = `Plan generated (${count} steps)`;
            } else if (activity.planApproved) {
              message = `Plan approved: ${activity.planApproved.planId}`;
            } else if (activity.progressUpdated) {
              message = `Progress: ${activity.progressUpdated.title}${activity.progressUpdated.description
                ? " - " + activity.progressUpdated.description
                : ""
                }`;
            } else if (activity.sessionCompleted) {
              message = "Session completed";
            } else if (activity.originator === "user") {
              message = `User: ${activity.description || "No content"}`;
            } else {
              message = activity.description || "Unknown activity";
            }
            activitiesChannel.appendLine(
              `${icon} ${timestamp} (${activity.originator}): ${message}`
            );
          });
        }

        // Check for plan generated
        const planActivity = activities.find((a) => a.planGenerated);
        if (planActivity?.planGenerated) {
          const plan = planActivity.planGenerated;
          if (plan.steps && plan.steps.length > 0) {
            const stepsText = plan.steps
              .map((step) => `${step.index + 1}. ${step.title}\n   ${step.description}`)
              .join('\n\n');

            const message = `📝 Plan Generated (${plan.steps.length} steps)\n\n${stepsText}\n\nApprove this plan?`;

            const action = await vscode.window.showInformationMessage(
              message,
              { modal: true },
              'Approve',
              'View Details'
            );

            if (action === 'Approve') {
              vscode.commands.executeCommand("jules-extension.approvePlan", sessionId);
            } else if (action === 'View Details') {
              // Show detailed plan steps in QuickPick
              const items = plan.steps.map((step) => ({
                label: `📋 Step ${step.index + 1}: ${step.title}`,
                detail: step.description,
                description: `ID: ${step.id}`,
              }));
              await vscode.window.showQuickPick(items, {
                placeHolder: 'Plan Details - Review all steps',
                canPickMany: false,
                matchOnDescription: true,
                matchOnDetail: true,
              });
            }
          }
        }

        await context.globalState.update("active-session-id", sessionId);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to show activities: ${error}`);
      }
    }
  );

  // Command: Approve Plan
  const approvePlanDisposable = vscode.commands.registerCommand(
    "jules-extension.approvePlan",
    async (sessionId: string) => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) return;

      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Approving plan...",
        }, async () => {
          await apiClient.approvePlan(sessionId);
          vscode.window.showInformationMessage("Plan approved successfully!");
          sessionsProvider.refresh();
        });
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to approve plan: ${error}`);
      }
    }
  );

  // Command: Delete Session
  const deleteSessionDisposable = vscode.commands.registerCommand(
    "jules-extension.deleteSession",
    async (item?: SessionTreeItem) => {
      if (!item || !(item instanceof SessionTreeItem)) {
        vscode.window.showErrorMessage("No session selected.");
        return;
      }
      const session = item.session;
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete session "${session.title}" from local cache?`,
        { modal: true },
        "Delete"
      );
      if (confirm === "Delete") {
        await sessionManager.deleteSession(session.name);
        sessionsProvider.refresh();
      }
    }
  );

  // Command: Open Pull Request
  const openPullRequestDisposable = vscode.commands.registerCommand(
    "jules-extension.openPullRequest",
    (url: string) => {
      vscode.env.openExternal(vscode.Uri.parse(url));
    }
  );

  // Command: Session Selected
  const sessionSelectedDisposable = vscode.commands.registerCommand(
    "jules-extension.sessionSelected",
    sessionSelectedHandler
  );

  // Command: Send Message
  const sendMessageDisposable = vscode.commands.registerCommand(
    "jules-extension.sendMessage",
    async (item?: SessionTreeItem | string) => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) return;

      let sessionId: string | undefined;
      if (item instanceof SessionTreeItem) {
        sessionId = item.session.name;
      } else if (typeof item === 'string') {
        sessionId = item;
      } else {
        sessionId = context.globalState.get<string>("active-session-id");
      }

      if (!sessionId) {
        vscode.window.showErrorMessage("No active session available.");
        return;
      }

      const result = await showMessageComposer({
        title: "Send Message to Jules",
        placeholder: "What would you like Jules to do?",
      });

      if (!result) return;
      const userPrompt = result.prompt.trim();
      if (!userPrompt) return;

      const finalPrompt = buildFinalPrompt(userPrompt);
      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Sending message...",
        }, async () => {
          await apiClient.sendMessage(sessionId!, finalPrompt);
          vscode.window.showInformationMessage("Message sent successfully!");
        });
        vscode.commands.executeCommand("jules-extension.showActivities", sessionId);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to send message: ${error}`);
      }
    }
  );

  // Command: Sign In GitHub
  const signInGitHubDisposable = vscode.commands.registerCommand(
    "jules-extension.signInGitHub",
    async () => {
      const token = await GitHubAuth.signIn();
      if (token) {
        vscode.window.showInformationMessage("Signed in to GitHub successfully!");
      }
    }
  );

  // Command: Set GitHub Token (Legacy/Alternative)
  const setGithubTokenDisposable = vscode.commands.registerCommand(
    "jules-extension.setGithubToken",
    async () => {
      const token = await vscode.window.showInputBox({
        prompt: "Enter your GitHub Personal Access Token",
        password: true,
        ignoreFocusOut: true,
      });
      if (token) {
        await context.secrets.store("jules-github-token", token);
        vscode.window.showInformationMessage("GitHub token saved.");
      }
    }
  );

  // Command: Set GitHub PAT (Deprecated but used in tests)
  const setGitHubPatDisposable = vscode.commands.registerCommand(
    "jules-extension.setGitHubPat",
    async () => {
      const token = await vscode.window.showInputBox({
        prompt: "Enter your GitHub Personal Access Token",
        password: true,
        ignoreFocusOut: true,
      });

      if (!token) return;

      // Validation logic
      const isValid = token.startsWith('ghp_') || token.startsWith('github_pat_');

      if (!isValid) {
        vscode.window.showErrorMessage("Invalid GitHub PAT format.");
        return;
      }

      await context.secrets.store("jules-github-token", token);
      vscode.window.showInformationMessage("GitHub token saved.");
    }
  );

  // Command: Open Settings
  const openSettingsDisposable = vscode.commands.registerCommand(
    "jules-extension.openSettings",
    () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:HirokiMukai.jules-extension"
      );
    }
  );

  // Command: Refresh Activities (Helper)
  const refreshActivitiesDisposable = vscode.commands.registerCommand(
    "jules-extension.refreshActivities",
    async () => {
      const currentSessionId = context.globalState.get("active-session-id") as string;
      if (currentSessionId) {
        vscode.commands.executeCommand("jules-extension.showActivities", currentSessionId);
      }
    }
  );

  context.subscriptions.push(
    setApiKeyDisposable,
    listSourcesDisposable,
    createSessionDisposable,
    refreshSessionsDisposable,
    showActivitiesDisposable,
    approvePlanDisposable,
    deleteSessionDisposable,
    openPullRequestDisposable,
    sessionSelectedDisposable,
    sendMessageDisposable,
    signInGitHubDisposable,
    setGithubTokenDisposable,
    setGitHubPatDisposable,
    openSettingsDisposable,
    refreshActivitiesDisposable
  );

  // Start polling
  pollingManager.startPolling();
}

export function deactivate() { }

