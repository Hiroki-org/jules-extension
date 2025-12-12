// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { JulesApiClient } from './julesApiClient';
import { GitHubBranch, GitHubRepo, Source as SourceType, SourcesResponse } from './types';
import { getBranchesForSession } from './branchUtils';
import { showMessageComposer } from './composer';
import { parseGitHubUrl } from "./githubUtils";
import { GitHubAuth } from './githubAuth';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
import { SourcesCache, isCacheValid } from './cache';
import { stripUrlCredentials } from './securityUtils';

// Constants
const JULES_API_BASE_URL = "https://jules.googleapis.com/v1alpha";
const VIEW_DETAILS_ACTION = 'View Details';
const SHOW_ACTIVITIES_COMMAND = 'jules-extension.showActivities';

// Plan notification display constants
const MAX_PLAN_STEPS_IN_NOTIFICATION = 5;
const MAX_PLAN_STEP_LENGTH = 80;

const SESSION_STATE = {
  AWAITING_PLAN_APPROVAL: "AWAITING_PLAN_APPROVAL",
  AWAITING_USER_FEEDBACK: "AWAITING_USER_FEEDBACK",
};

// GitHub PR status cache to avoid excessive API calls
interface PRStatusCache {
  [prUrl: string]: {
    isClosed: boolean;
    lastChecked: number;
  };
}

const prStatusCache: PRStatusCache = {};
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

interface SessionResponse {
  name: string;
  // Add other fields if needed
}

export interface SessionOutput {
  pullRequest?: {
    url: string;
    title: string;
    description: string;
  };
}

export interface Session {
  name: string;
  title: string;
  state: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  rawState: string;
  outputs?: SessionOutput[];
  sourceContext?: {
    source: string;
  };
  requirePlanApproval?: boolean; // ⭐ NEW
}

export function mapApiStateToSessionState(
  apiState: string
): "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" {
  switch (apiState) {
    case "PLANNING":
    case "AWAITING_PLAN_APPROVAL":
    case "AWAITING_USER_FEEDBACK":
    case "IN_PROGRESS":
    case "QUEUED":
    case "STATE_UNSPECIFIED":
      return "RUNNING";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    case "PAUSED":
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "RUNNING"; // default to RUNNING
  }
}

interface SessionState {
  name: string;
  state: string;
  rawState: string;
  outputs?: SessionOutput[];
  isTerminated?: boolean;
}

let previousSessionStates: Map<string, SessionState> = new Map();
let notifiedSessions: Set<string> = new Set();
let logChannel: vscode.OutputChannel;

function loadPreviousSessionStates(context: vscode.ExtensionContext): void {
  const storedStates = context.globalState.get<{ [key: string]: SessionState }>(
    "jules.previousSessionStates",
    {}
  );
  previousSessionStates = new Map(Object.entries(storedStates));
  console.log(
    `Jules: Loaded ${previousSessionStates.size} previous session states from global state.`
  );
}
let autoRefreshInterval: NodeJS.Timeout | undefined;
let isFetchingSensitiveData = false;

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

    const response = await fetch(
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
      logger.appendLine(`[Jules] GitHub API error response: ${respText}`);
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

function extractPRUrl(sessionOrState: Session | SessionState): string | null {
  return (
    sessionOrState.outputs?.find((o) => o.pullRequest)?.pullRequest?.url || null
  );
}

async function checkPRStatus(
  prUrl: string,
  context: vscode.ExtensionContext
): Promise<boolean> {
  // Check cache first
  const cached = prStatusCache[prUrl];
  const now = Date.now();
  if (cached && now - cached.lastChecked < PR_CACHE_DURATION) {
    return cached.isClosed;
  }

  try {
    // Parse GitHub PR URL: https://github.com/owner/repo/pull/123
    const match = prUrl.match(
      /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
    );
    if (!match) {
      console.log(`Jules: Invalid GitHub PR URL format: ${prUrl}`);
      return false;
    }

    const [, owner, repo, prNumber] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

    // Get GitHub token if available
    const githubToken = await context.secrets.get("jules-github-token");
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      console.log(
        `Jules: Failed to fetch PR status: ${response.status} ${response.statusText}`
      );
      return false;
    }

    const prData = (await response.json()) as { state: string };
    const isClosed = prData.state === "closed";

    // Update cache
    prStatusCache[prUrl] = {
      isClosed,
      lastChecked: now,
    };

    return isClosed;
  } catch (error) {
    console.error(`Jules: Error checking PR status for ${prUrl}:`, error);
    return false;
  }
}

function checkForCompletedSessions(currentSessions: Session[]): Session[] {
  const completedSessions: Session[] = [];
  for (const session of currentSessions) {
    const prevState = previousSessionStates.get(session.name);
    if (prevState?.isTerminated) {
      continue; // Skip terminated sessions
    }
    if (
      session.state === "COMPLETED" &&
      (!prevState || prevState.state !== "COMPLETED")
    ) {
      const prUrl = extractPRUrl(session);
      if (prUrl) {
        // Only count as a new completion if there's a PR URL.
        completedSessions.push(session);
      }
    }
  }
  return completedSessions;
}

function checkForSessionsInState(
  currentSessions: Session[],
  targetState: string
): Session[] {
  return currentSessions.filter((session) => {
    const prevState = previousSessionStates.get(session.name);
    const isNotTerminated = !prevState?.isTerminated;
    const isTargetState = session.rawState === targetState;
    const isStateChanged = !prevState || prevState.rawState !== targetState;
    const willNotify = isNotTerminated && isTargetState && isStateChanged;
    if (isTargetState) {
      logChannel.appendLine(`Jules: Debug - Session ${session.name}: terminated=${!isNotTerminated}, rawState=${session.rawState}, prevRawState=${prevState?.rawState}, willNotify=${willNotify}`);
    }
    return willNotify;
  });
}

async function notifyPRCreated(session: Session, prUrl: string): Promise<void> {
  const result = await vscode.window.showInformationMessage(
    `Session "${session.title}" has completed and created a PR!`,
    "Open PR"
  );
  if (result === "Open PR") {
    vscode.env.openExternal(vscode.Uri.parse(prUrl));
  }
}

async function fetchPlanFromActivities(
  sessionId: string,
  apiKey: string
): Promise<Plan | null> {
  try {
    const response = await fetch(
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
      console.log(`Jules: Failed to fetch activities for plan: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as ActivitiesResponse;
    if (!data.activities || !Array.isArray(data.activities)) {
      return null;
    }

    // Find the most recent planGenerated activity (reverse to get latest first)
    const planActivity = [...data.activities].reverse().find((a) => a.planGenerated);
    return planActivity?.planGenerated?.plan || null;
  } catch (error) {
    console.error(`Jules: Error fetching plan from activities: ${error}`);
    return null;
  }
}

function formatPlanForNotification(plan: Plan): string {
  const parts: string[] = [];
  if (plan.title) {
    parts.push(`📋 ${plan.title}`);
  }
  if (plan.steps && plan.steps.length > 0) {
    const stepsPreview = plan.steps.slice(0, MAX_PLAN_STEPS_IN_NOTIFICATION);
    stepsPreview.forEach((step, index) => {
      // Truncate long steps for notification display
      const truncatedStep = step.length > MAX_PLAN_STEP_LENGTH
        ? step.substring(0, MAX_PLAN_STEP_LENGTH - 3) + '...'
        : step;
      parts.push(`${index + 1}. ${truncatedStep}`);
    });
    if (plan.steps.length > MAX_PLAN_STEPS_IN_NOTIFICATION) {
      parts.push(`... and ${plan.steps.length - MAX_PLAN_STEPS_IN_NOTIFICATION} more steps`);
    }
  }
  return parts.join('\n');
}

async function notifyPlanAwaitingApproval(
  session: Session,
  context: vscode.ExtensionContext
): Promise<void> {
  // Fetch plan details from activities
  const apiKey = await context.secrets.get("jules-api-key");
  let planDetails = '';

  if (apiKey) {
    const plan = await fetchPlanFromActivities(session.name, apiKey);
    if (plan) {
      planDetails = formatPlanForNotification(plan);
    }
  }

  // Build notification message with plan content
  let message = `Jules has a plan ready for your approval in session: "${session.title}"`;
  if (planDetails) {
    message += `\n\n${planDetails}`;
  }

  const selection = await vscode.window.showInformationMessage(
    message,
    { modal: true },
    "Approve Plan",
    VIEW_DETAILS_ACTION
  );

  if (selection === "Approve Plan") {
    await approvePlan(session.name, context);
  } else if (selection === VIEW_DETAILS_ACTION) {
    await vscode.commands.executeCommand(
      SHOW_ACTIVITIES_COMMAND,
      session.name
    );
  }
}

async function notifyUserFeedbackRequired(session: Session): Promise<void> {
  const selection = await vscode.window.showInformationMessage(
    `Jules is waiting for your feedback in session: "${session.title}"`,
    VIEW_DETAILS_ACTION
  );

  if (selection === VIEW_DETAILS_ACTION) {
    await vscode.commands.executeCommand(
      SHOW_ACTIVITIES_COMMAND,
      session.name
    );
  }
}

export function areOutputsEqual(a?: SessionOutput[], b?: SessionOutput[]): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const prA = a[i]?.pullRequest;
    const prB = b[i]?.pullRequest;

    if (
      prA?.url !== prB?.url ||
      prA?.title !== prB?.title ||
      prA?.description !== prB?.description
    ) {
      return false;
    }
  }
  return true;
}

export async function updatePreviousStates(
  currentSessions: Session[],
  context: vscode.ExtensionContext
): Promise<void> {
  let hasChanged = false;

  // 1. Identify sessions that require PR status checks
  // We only check for sessions that are COMPLETED, have a PR URL, and are NOT already terminated.
  const sessionsToCheck = currentSessions.filter(session => {
    const prevState = previousSessionStates.get(session.name);
    if (prevState?.isTerminated) { return false; }
    return session.state === "COMPLETED" && extractPRUrl(session);
  });

  // 2. Perform checks in parallel
  // This avoids sequential API calls (N+1 problem) when multiple sessions are completed.
  const prStatusMap = new Map<string, boolean>();

  if (sessionsToCheck.length > 0) {
    await Promise.all(sessionsToCheck.map(async (session) => {
      const prUrl = extractPRUrl(session);
      // The `if (prUrl)` check is redundant because `sessionsToCheck` is already filtered.
      // `prUrl` is guaranteed to be non-null here.
      const isClosed = await checkPRStatus(prUrl!, context);
      prStatusMap.set(session.name, isClosed);
    }));
  }

  for (const session of currentSessions) {
    const prevState = previousSessionStates.get(session.name);

    // If already terminated, we don't need to check again.
    // Just update with the latest info from the server but keep it terminated.
    if (prevState?.isTerminated) {
      if (
        prevState.state !== session.state ||
        prevState.rawState !== session.rawState ||
        !areOutputsEqual(prevState.outputs, session.outputs)
      ) {
        previousSessionStates.set(session.name, {
          ...prevState,
          state: session.state,
          rawState: session.rawState,
          outputs: session.outputs,
        });
        hasChanged = true;
      }
      continue;
    }

    let isTerminated = false;
    if (session.state === "COMPLETED") {
      const prUrl = extractPRUrl(session);
      if (prUrl) {
        // Use pre-fetched status
        const isClosed = prStatusMap.get(session.name) ?? false;
        if (isClosed) {
          isTerminated = true;
          console.log(
            `Jules: Session ${session.name} is now terminated because its PR is closed.`
          );
          notifiedSessions.delete(session.name);
        }
      }
    } else if (session.state === "FAILED" || session.state === "CANCELLED") {
      isTerminated = true;
      console.log(
        `Jules: Session ${session.name} is now terminated due to its state: ${session.state}.`
      );
      notifiedSessions.delete(session.name);
    }

    // Check if state actually changed before updating map
    if (
      !prevState ||
      prevState.state !== session.state ||
      prevState.rawState !== session.rawState ||
      prevState.isTerminated !== isTerminated ||
      !areOutputsEqual(prevState.outputs, session.outputs)
    ) {
      previousSessionStates.set(session.name, {
        name: session.name,
        state: session.state,
        rawState: session.rawState,
        outputs: session.outputs,
        isTerminated: isTerminated,
      });
      hasChanged = true;
    }
  }

  // Persist the updated states to global state ONLY if changed
  if (hasChanged) {
    await context.globalState.update(
      "jules.previousSessionStates",
      Object.fromEntries(previousSessionStates)
    );
    console.log(
      `Jules: Saved ${previousSessionStates.size} session states to global state.`
    );
  }
}

function startAutoRefresh(
  context: vscode.ExtensionContext,
  sessionsProvider: JulesSessionsProvider
): void {
  const config = vscode.workspace.getConfiguration(
    "jules-extension.autoRefresh"
  );
  const isEnabled = config.get<boolean>("enabled");

  // 動的に間隔を選択
  const intervalSeconds = isFetchingSensitiveData
    ? config.get<number>("fastInterval", 30)
    : config.get<number>("interval", 60);
  const interval = intervalSeconds * 1000; // Convert seconds to milliseconds

  logChannel.appendLine(
    `Jules: Auto-refresh enabled=${isEnabled}, interval=${intervalSeconds}s (${interval}ms), fastMode=${isFetchingSensitiveData}`
  );

  if (!isEnabled) {
    return;
  }

  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(() => {
    logChannel.appendLine("Jules: Auto-refresh triggered");
    sessionsProvider.refresh(true); // Pass true for background refresh
  }, interval);
}

function stopAutoRefresh(): void {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = undefined;
  }
}

function resetAutoRefresh(
  context: vscode.ExtensionContext,
  sessionsProvider: JulesSessionsProvider
): void {
  stopAutoRefresh();
  startAutoRefresh(context, sessionsProvider);
}

interface SessionsResponse {
  sessions: Session[];
}

interface Plan {
  title?: string;
  steps?: string[];
}

interface Activity {
  name: string;
  createTime: string;
  originator: "user" | "agent";
  id: string;
  type?: string;
  planGenerated?: { plan: Plan };
  planApproved?: { planId: string };
  progressUpdated?: { title: string; description?: string };
  sessionCompleted?: Record<string, never>;
}

interface ActivitiesResponse {
  activities: Activity[];
}

function getActivityIcon(activity: Activity): string {
  if (activity.planGenerated) {
    return "📝";
  }
  if (activity.planApproved) {
    return "👍";
  }
  if (activity.progressUpdated) {
    return "🔄";
  }
  if (activity.sessionCompleted) {
    return "✅";
  }
  return "ℹ️";
}

class JulesSessionsProvider
  implements vscode.TreeDataProvider<vscode.TreeItem> {
  private static silentOutputChannel: vscode.OutputChannel = {
    name: 'silent-channel',
    append: () => {},
    appendLine: () => {},
    replace: () => {},
    clear: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
  };

  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private sessionsCache: Session[] = [];
  private isFetching = false;

  constructor(private context: vscode.ExtensionContext) { }

  private async fetchAndProcessSessions(
    isBackground: boolean = false
  ): Promise<void> {
    if (this.isFetching) {
      logChannel.appendLine("Jules: Fetch already in progress. Skipping.");
      return;
    }
    this.isFetching = true;
    logChannel.appendLine("Jules: Starting to fetch and process sessions...");

    try {
      const apiKey = await getStoredApiKey(this.context);
      if (!apiKey) {
        this.sessionsCache = [];
        return;
      }

      const response = await fetch(`${JULES_API_BASE_URL}/sessions`, {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorMsg = `Failed to fetch sessions: ${response.status} ${response.statusText}`;
        logChannel.appendLine(`Jules: ${errorMsg}`);
        if (!isBackground) {
          vscode.window.showErrorMessage(errorMsg);
        }
        this.sessionsCache = [];
        return;
      }

      const data = (await response.json()) as SessionsResponse;
      if (!data.sessions || !Array.isArray(data.sessions)) {
        logChannel.appendLine("Jules: No sessions found or invalid response format");
        this.sessionsCache = [];
        return;
      }

      // デバッグ: APIレスポンスの生データを確認
      logChannel.appendLine(`Jules: Debug - Raw API response sample (first 3 sessions):`);
      data.sessions.slice(0, 3).forEach((s: any, i: number) => {
        logChannel.appendLine(`  [${i}] name=${s.name}, state=${s.state}, title=${s.title}`);
        logChannel.appendLine(`      updateTime=${s.updateTime}`);
      });

      logChannel.appendLine(`Jules: Found ${data.sessions.length} total sessions`);

      const allSessionsMapped = data.sessions.map((session) => ({
        ...session,
        rawState: session.state,
        state: mapApiStateToSessionState(session.state),
      }));

      // デバッグ: 全セッションのrawStateをログ出力
      logChannel.appendLine(`Jules: Debug - Total sessions: ${allSessionsMapped.length}`);
      const stateCounts = allSessionsMapped.reduce((acc, s) => {
        acc[s.rawState] = (acc[s.rawState] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      logChannel.appendLine(`Jules: Debug - State counts: ${JSON.stringify(stateCounts)}`);

      this.processSessionNotifications(
        allSessionsMapped,
        SESSION_STATE.AWAITING_PLAN_APPROVAL,
        (session) => notifyPlanAwaitingApproval(session, this.context),
        "plan approval"
      );

      this.processSessionNotifications(
        allSessionsMapped,
        SESSION_STATE.AWAITING_USER_FEEDBACK,
        notifyUserFeedbackRequired,
        "user feedback"
      );

      // --- Check for completed sessions (PR created) ---
      const completedSessions = checkForCompletedSessions(allSessionsMapped);
      if (completedSessions.length > 0) {
        logChannel.appendLine(
          `Jules: Found ${completedSessions.length} completed sessions`
        );
        for (const session of completedSessions) {
          const prUrl = extractPRUrl(session);
          if (prUrl) {
            notifyPRCreated(session, prUrl).catch((error) => {
              logChannel.appendLine(`Jules: Failed to show PR notification: ${error}`);
            });
          }
        }
      }

      // --- Update previous states after all checks ---
      await updatePreviousStates(allSessionsMapped, this.context);

      // --- Update the cache ---
      this.sessionsCache = allSessionsMapped;
      if (isBackground) {
        // Errors are handled inside _refreshBranchCacheInBackground, so we call it fire-and-forget.
        // The void operator is used to intentionally ignore the promise and avoid lint errors about floating promises.
        void this._refreshBranchCacheInBackground(apiKey);
      }
    } catch (error) {
      logChannel.appendLine(`Jules: Error during fetchAndProcessSessions: ${error}`);
      // Retain cache on error to avoid losing data
    } finally {
      this.isFetching = false;
      logChannel.appendLine("Jules: Finished fetching and processing sessions.");
      // Fire the event to refresh the view with the new data
      this._onDidChangeTreeData.fire();
    }
  }

  private async _refreshBranchCacheInBackground(apiKey: string): Promise<void> {
    const selectedSource = this.context.globalState.get<SourceType>("selected-source");
    if (!selectedSource) {
      return;
    }

    console.log(`Jules: Background refresh, updating branches for ${selectedSource.name}`);
    try {
      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);
      await getBranchesForSession(selectedSource, apiClient, JulesSessionsProvider.silentOutputChannel, this.context, { forceRefresh: true, showProgress: false });
      console.log("Jules: Branch cache updated successfully during background refresh");
    } catch (e) {
      console.error("Jules: Failed to update branch cache during background refresh", e);
    }
  }

  async refresh(isBackground: boolean = false): Promise<void> {
    console.log(
      `Jules: refresh() called (isBackground: ${isBackground}), starting fetch.`
    );
    await this.fetchAndProcessSessions(isBackground);
  }

  private processSessionNotifications(
    sessions: Session[],
    state: string,
    notifier: (session: Session) => Promise<void>,
    notificationType: string
  ) {
    const sessionsToNotify = checkForSessionsInState(sessions, state);
    if (sessionsToNotify.length > 0) {
      logChannel.appendLine(
        `Jules: Found ${sessionsToNotify.length} sessions awaiting ${notificationType}`
      );
      for (const session of sessionsToNotify) {
        if (!notifiedSessions.has(session.name)) {
          notifier(session).catch((error) => {
            logChannel.appendLine(
              `Jules: Failed to show ${notificationType} notification for session '${session.name}' (${session.title}): ${error}`
            );
          });
          notifiedSessions.add(session.name);
        }
      }
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    // If the cache is empty, it might be the first load.
    if (this.sessionsCache.length === 0 && !this.isFetching) {
      await this.fetchAndProcessSessions();
    }

    const selectedSource =
      this.context.globalState.get<SourceType>("selected-source");

    if (!selectedSource) {
      const item = new vscode.TreeItem(
        "ℹ️ No source selected. Click to select a source."
      );
      item.command = {
        command: "jules-extension.listSources",
        title: "Select Source",
      };
      item.contextValue = "no-source";
      return [item];
    }

    // Now, use the cache to build the tree
    let filteredSessions = this.sessionsCache.filter(
      (session) =>
        (session as any).sourceContext?.source === selectedSource.name
    );

    console.log(
      `Jules: Found ${filteredSessions.length} sessions for the selected source from cache`
    );

    // Filter out sessions with closed PRs if the setting is enabled
    const hideClosedPRs = vscode.workspace
      .getConfiguration("jules-extension")
      .get<boolean>("hideClosedPRSessions", true);

    if (hideClosedPRs) {
      // We no longer need to check PR status on every render.
      // The `isTerminated` flag in `previousSessionStates` handles this.
      const beforeFilterCount = filteredSessions.length;
      filteredSessions = filteredSessions.filter((session) => {
        const prevState = previousSessionStates.get(session.name);
        // Hide if the session is marked as terminated.
        return !prevState?.isTerminated;
      });
      const filteredCount = beforeFilterCount - filteredSessions.length;
      if (filteredCount > 0) {
        console.log(
          `Jules: Filtered out ${filteredCount} terminated sessions (${beforeFilterCount} -> ${filteredSessions.length})`
        );
      }
    }

    if (filteredSessions.length === 0) {
      return [new vscode.TreeItem("No sessions found for this source.")];
    }

    return filteredSessions.map((session) => new SessionTreeItem(session));
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(public readonly session: Session) {
    super(session.title || session.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${session.name} - ${session.state}${session.requirePlanApproval ? ' (Plan Approval Required)' : ''}`;
    this.description = session.state;
    this.iconPath = this.getIcon(session.state, session.rawState);
    this.contextValue = "jules-session";
    this.command = {
      command: SHOW_ACTIVITIES_COMMAND,
      title: "Show Activities",
      arguments: [session.name],
    };
  }

  private getIcon(state: string, rawState?: string): vscode.ThemeIcon {
    if (rawState === SESSION_STATE.AWAITING_PLAN_APPROVAL) {
      return new vscode.ThemeIcon("clock");
    }
    if (rawState === SESSION_STATE.AWAITING_USER_FEEDBACK) {
      return new vscode.ThemeIcon("comment-discussion");
    }
    switch (state) {
      case "RUNNING":
        return new vscode.ThemeIcon("sync~spin");
      case "COMPLETED":
        return new vscode.ThemeIcon("check");
      case "FAILED":
        return new vscode.ThemeIcon("error");
      case "CANCELLED":
        return new vscode.ThemeIcon("close");
      default:
        return new vscode.ThemeIcon("question");
    }
  }
}

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
        const response = await fetch(
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
        const response = await fetch(
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
    // GitHubリポジトリ名を抽出（例: "sources/github/owner/repo" -> "owner/repo"）
    const repoMatch = selectedSource.name?.match(/sources\/github\/(.+)/);
    const repoName = repoMatch ? repoMatch[1] : selectedSource.name;

    statusBarItem.text = `$(repo) Jules: ${repoName}`;
    statusBarItem.tooltip = `Current Source: ${repoName}\nClick to change source`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(repo) Jules: No source selected`;
    statusBarItem.tooltip = "Click to select a source";
    statusBarItem.show();
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Jules Extension is now active");

  loadPreviousSessionStates(context);

  const sessionsProvider = new JulesSessionsProvider(context);
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

  // Create OutputChannel for Activities
  const activitiesChannel =
    vscode.window.createOutputChannel("Jules Activities");
  context.subscriptions.push(activitiesChannel);

  // Create OutputChannel for Logs
  logChannel = vscode.window.createOutputChannel("Jules Extension Logs");
  context.subscriptions.push(logChannel);

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
        const response = await fetch(`${JULES_API_BASE_URL}/sources`, {
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

      isFetchingSensitiveData = true;
      resetAutoRefresh(context, sessionsProvider);

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
            const response = await fetch(`${JULES_API_BASE_URL}/sources`, {
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

        const items: SourceQuickPickItem[] = sources.map((source) => ({
          label: source.name || source.id || "Unknown",
          description: source.url || "",
          detail: source.description || "",
          source: source,
        }));
        const selected: SourceQuickPickItem | undefined =
          await vscode.window.showQuickPick(items, {
            placeHolder: "Select a Jules Source",
          });
        if (selected) {
          await context.globalState.update("selected-source", selected.source);
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
        isFetchingSensitiveData = false;
        resetAutoRefresh(context, sessionsProvider);
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

      isFetchingSensitiveData = true;
      resetAutoRefresh(context, sessionsProvider);
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
            logChannel.appendLine(`[Jules] Using default branch: ${selectedDefaultBranch}`);
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
            const response = await fetch(`${JULES_API_BASE_URL}/sessions`, {
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
        isFetchingSensitiveData = false;
        resetAutoRefresh(context, sessionsProvider);
      }
    }
  );

  // Perform initial refresh to populate the tree view (async, don't wait)
  console.log("Jules: Starting initial refresh...");
  sessionsProvider.refresh();

  startAutoRefresh(context, sessionsProvider);

  const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (
        event.affectsConfiguration("jules-extension.autoRefresh.enabled") ||
        event.affectsConfiguration("jules-extension.autoRefresh.interval")
      ) {
        stopAutoRefresh();
        const autoRefreshEnabled = vscode.workspace
          .getConfiguration("jules-extension.autoRefresh")
          .get<boolean>("enabled");
        if (autoRefreshEnabled) {
          startAutoRefresh(context, sessionsProvider);
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
        const sessionResponse = await fetch(
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
        const response = await fetch(
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
    async () => {
      const sessionId = context.globalState.get<string>("active-session-id");
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
      previousSessionStates.delete(session.name);
      await context.globalState.update(
        "jules.previousSessionStates",
        Object.fromEntries(previousSessionStates)
      );

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
        Object.keys(prStatusCache).forEach((key) => delete prStatusCache[key]);
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
    clearCacheDisposable
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  stopAutoRefresh();
}

