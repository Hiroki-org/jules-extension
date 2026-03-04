// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { JulesApiClient } from "./julesApiClient";
import {
  GitHubBranch,
  GitHubRepo,
  Source as SourceType,
  Session,
  SessionOutput,
  PullRequestOutput,
  Activity,
  ActivitiesResponse,
} from "./types";
import { getBranchesForSession } from "./branchUtils";
import { showMessageComposer } from "./composer";
import { parseGitHubUrl } from "./githubUtils";
import { GitHubAuth } from "./githubAuth";
import { SourcesCache, isCacheValid } from "./cache";
import {
  stripUrlCredentials,
  sanitizeForLogging,
  isValidSessionId,
} from "./securityUtils";
import { sanitizeError } from "./errorUtils";
import { fetchWithTimeout, setSocksProxy } from "./fetchUtils";
import { formatPlanForNotification, Plan } from "./planUtils";
import {
  getPullRequestUrlForSession,
  openPullRequestInBrowser,
  checkoutToBranchForSession,
} from "./sessionContextMenu";
import {
  getCachedSessionArtifacts,
  updateSessionArtifactsCache,
  fetchLatestSessionArtifacts,
  initializeSessionArtifactsCacheFromGlobalState,
} from "./sessionArtifacts";
import {
  JulesDiffDocumentProvider,
  openLatestDiffForSession,
  openChangesetForSession,
} from "./sessionContextMenuArtifacts";
import {
  JulesPlanDocumentProvider,
  reviewPlanForSession,
} from "./planDocumentProvider";
import { mapLimit } from "./asyncUtils";
import { buildSessionTooltip } from "./tooltipUtils";
import {
  getActivityCategory,
  getActivityIcon,
  pickFirstNonEmpty,
  truncateForDisplay,
  getActivitySummaryText,
  getActivityLabelPrefix,
  getActivityThemeIcon,
  getActiveActivityKeys,
  ACTIVITY_UNION_KEYS,
  type ActivityCategory,
  type ActivityUnionKey,
} from "./activityUtils";

// Constants
const JULES_API_BASE_URL = "https://jules.googleapis.com/v1alpha";
const VIEW_DETAILS_ACTION = "View Details";
const SHOW_ACTIVITIES_COMMAND = "jules-extension.showActivities";
const ALL_SOURCES_ID = "all_repos";
const MAX_PAGE_SIZE = 100;
const MAX_PAGINATION_PAGES = 100;
const MAX_ACTIVITIES_CACHE_SIZE = 50;
const ACTIVITIES_LATEST_CREATE_TIME_KEY_PREFIX =
  "jules.activities.latestCreateTime";

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

let prStatusCache: PRStatusCache = {};
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

// Re-export Session, SessionOutput, and SessionState from types for backward compatibility
export { Session, SessionOutput, SessionState } from "./types";
import type { SessionState } from "./types";

export function mapApiStateToSessionState(apiState: string): SessionState {
  switch (apiState) {
    case "IN_PROGRESS":
    case "QUEUED":
    case "STATE_UNSPECIFIED":
      return "RUNNING";
    case "PLANNING":
      return "PLANNING";
    case "AWAITING_PLAN_APPROVAL":
      return "AWAITING_PLAN_APPROVAL";
    case "AWAITING_USER_FEEDBACK":
      return "AWAITING_USER_FEEDBACK";
    case "PAUSED":
      return "PAUSED";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "RUNNING"; // default to RUNNING
  }
}

function isSessionActive(session: Session): boolean {
  const activeStates = new Set([
    "IN_PROGRESS",
    "PLANNING",
    "AWAITING_PLAN_APPROVAL",
    "EXECUTING_PLAN",
  ]);
  return activeStates.has(session.rawState);
}

interface CachedSessionState {
  name: string;
  state: SessionState;
  rawState: string;
  outputs?: SessionOutput[];
  isTerminated?: boolean;
}

let previousSessionStates: Map<string, CachedSessionState> = new Map();
let notifiedSessions: Set<string> = new Set();
// Initialize with dummy to support usage before activate (e.g. in tests)
let logChannel: vscode.OutputChannel = {
  name: "Jules Logs (Fallback)",
  append: (val: string) => console.log(val),
  appendLine: (val: string) => console.log(val),
  replace: (val: string) => console.log(val),
  clear: () => { },
  show: () => { },
  hide: () => { },
  dispose: () => { },
};

function loadPreviousSessionStates(context: vscode.ExtensionContext): void {
  const storedStates = context.globalState.get<{
    [key: string]: CachedSessionState;
  }>("jules.previousSessionStates", {});
  previousSessionStates = new Map(Object.entries(storedStates));
  console.log(
    `Jules: Loaded ${previousSessionStates.size} previous session states from global state.`,
  );
}
let autoRefreshInterval: NodeJS.Timeout | undefined;
let isFetchingSensitiveData = false;

// Helper functions

async function getStoredApiKey(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const apiKey = await context.secrets.get("jules-api-key");
  if (!apiKey) {
    vscode.window.showErrorMessage(
      'API Key not found. Please set it first using "Set Jules API Key" command.',
    );
    return undefined;
  }
  return apiKey;
}

async function getGitHubUrl(): Promise<string | undefined> {
  try {
    const gitExtension = vscode.extensions.getExtension("vscode.git");
    if (!gitExtension) {
      throw new Error("Git extension not found");
    }
    const git = gitExtension.exports.getAPI(1);
    const repository = git.repositories[0];
    if (!repository) {
      throw new Error("No Git repository found");
    }
    const remote = repository.state.remotes.find(
      (r: { name: string; fetchUrl?: string; pushUrl?: string }) =>
        r.name === "origin",
    );
    if (!remote) {
      throw new Error("No origin remote found");
    }
    return remote.fetchUrl || remote.pushUrl;
  } catch (error) {
    console.error("Failed to get GitHub URL:", sanitizeError(error));
    return undefined;
  }
}

/**
 * Get and activate the VS Code Git Extension API
 */
async function getGitApi(outputChannel?: vscode.OutputChannel): Promise<any> {
  const logger =
    outputChannel ??
    ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);
  const gitExtension = vscode.extensions.getExtension("vscode.git");
  if (!gitExtension) {
    throw new Error("Git extension not found");
  }
  // Ensure the Git extension is activated
  await gitExtension.activate();
  const git = gitExtension.exports.getAPI(1);
  if (!git) {
    throw new Error("Git API not available");
  }
  return git;
}

/**
 * Find the Git repository that corresponds to the given workspace folder
 */
function getRepositoryForWorkspaceFolder(
  git: any,
  workspaceFolder: vscode.WorkspaceFolder,
  outputChannel?: vscode.OutputChannel,
): any {
  const logger =
    outputChannel ??
    ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);
  const repository = git.repositories.find(
    (repo: any) => repo.rootUri?.fsPath === workspaceFolder.uri.fsPath,
  );
  if (!repository) {
    const safeWsPath = sanitizeForLogging(workspaceFolder.uri.fsPath);
    logger.appendLine(
      `[Jules] No Git repository found for workspace folder ${safeWsPath}`,
    );
    return null;
  }
  return repository;
}

/**
 * Get the remote URL from a repository, with fallback strategy:
 * 1. Try 'origin' remote
 * 2. Fall back to first remote with fetchUrl or pushUrl
 * 3. Return null if none found
 */
function getRemoteUrl(
  repository: any,
  preferredRemoteName: string = "origin",
  outputChannel?: vscode.OutputChannel,
): string | null {
  const logger =
    outputChannel ??
    ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);

  if (!repository.state.remotes || repository.state.remotes.length === 0) {
    logger.appendLine("[Jules] No remotes found in repository");
    return null;
  }

  // Try to find the preferred remote (default: 'origin')
  let remote = repository.state.remotes.find(
    (r: any) => r.name === preferredRemoteName,
  );

  // Fallback: find first remote with a URL
  if (!remote) {
    remote = repository.state.remotes.find((r: any) => r.fetchUrl || r.pushUrl);
    if (remote) {
      logger.appendLine(
        `[Jules] Preferred remote '${preferredRemoteName}' not found, using '${remote.name}'`,
      );
    }
  }

  if (!remote) {
    logger.appendLine(`[Jules] No remote URL found in repository`);
    return null;
  }

  const remoteUrl = remote.fetchUrl || remote.pushUrl;
  if (!remoteUrl) {
    logger.appendLine(
      `[Jules] Remote '${remote.name}' has no fetchUrl or pushUrl`,
    );
    return null;
  }

  return remoteUrl;
}

/**
 * リモートブランチ作成に必要なリポジトリ情報を取得
 */
async function getRepoInfoForBranchCreation(
  outputChannel?: vscode.OutputChannel,
): Promise<{ token: string; owner: string; repo: string } | null> {
  const logger =
    outputChannel ??
    ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);
  const token = await GitHubAuth.getToken();

  if (!token) {
    const action = await vscode.window.showInformationMessage(
      "Sign in to GitHub to create remote branch",
      "Sign In",
      "Cancel",
    );

    if (action === "Sign In") {
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
    vscode.window.showErrorMessage("No workspace folder found");
    return null;
  }

  try {
    const git = await getGitApi(outputChannel);
    const repository = getRepositoryForWorkspaceFolder(
      git,
      workspaceFolder,
      outputChannel,
    );
    if (!repository) {
      throw new Error("No Git repository found for workspace folder");
    }

    const remoteUrl = getRemoteUrl(repository, "origin", outputChannel);
    if (!remoteUrl) {
      throw new Error("No remote URL found");
    }

    const safeRemoteUrl = stripUrlCredentials(remoteUrl);
    logger.appendLine(`[Jules] Remote URL: ${safeRemoteUrl}`);

    // Prefer the shared parser which handles https/ssh and .git suffixes
    const repoInfo = parseGitHubUrl(safeRemoteUrl);
    if (!repoInfo) {
      vscode.window.showErrorMessage("Could not parse GitHub repository URL");
      return null;
    }
    const { owner, repo } = repoInfo;
    logger.appendLine(`[Jules] Repository: ${owner}/${repo}`);

    return { token, owner, repo };
  } catch (error: any) {
    logger.appendLine(`[Jules] Error getting repo info: ${error.message}`);
    vscode.window.showErrorMessage(
      `Failed to get repository info: ${error.message}`,
    );
    return null;
  }
}

async function createRemoteBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  outputChannel?: vscode.OutputChannel,
): Promise<void> {
  const logger =
    outputChannel ??
    ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);
  try {
    logger.appendLine("[Jules] Getting current branch SHA...");
    const sha = await getCurrentBranchSha(outputChannel);

    if (!sha) {
      throw new Error("Failed to get current branch SHA");
    }

    logger.appendLine(`[Jules] Current branch SHA: ${sha}`);
    logger.appendLine(`[Jules] Creating remote branch: ${branchName}`);

    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: sha,
        }),
      },
    );

    if (!response.ok) {
      // Read the response as text so we can handle non-JSON errors robustly
      const respText = await response.text();
      logger.appendLine(
        `[Jules] GitHub API error response: ${sanitizeForLogging(respText)}`,
      );
      let errMsg = "Unknown error";
      try {
        const parsed = JSON.parse(respText);
        errMsg = parsed?.message || JSON.stringify(parsed);
      } catch (e) {
        errMsg = respText;
      }
      throw new Error(`GitHub API error: ${response.status} - ${errMsg}`);
    }

    const result: any = await response.json().catch(() => null);
    logger.appendLine(
      `[Jules] Remote branch created: ${result?.ref ?? "unknown"}`,
    );
  } catch (error: any) {
    logger.appendLine(
      `[Jules] Failed to create remote branch: ${error.message}`,
    );
    throw error;
  }
}

async function getCurrentBranchSha(
  outputChannel?: vscode.OutputChannel,
): Promise<string | null> {
  const logger =
    outputChannel ??
    ({ appendLine: (s: string) => console.log(s) } as vscode.OutputChannel);
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      logger.appendLine(
        "[Jules] No workspace folder found to get current branch SHA.",
      );
      return null;
    }

    const git = await getGitApi(outputChannel);
    const repository = getRepositoryForWorkspaceFolder(
      git,
      workspaceFolder,
      outputChannel,
    );
    if (!repository) {
      return null;
    }

    return repository.state.HEAD?.commit || null;
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

/**
 * Get privacy icon for a source
 * @param isPrivate - The isPrivate field from Source
 * @returns Lock icon for private repos, empty string otherwise
 */
function getPrivacyIcon(isPrivate?: boolean): string {
  return isPrivate === true ? "$(lock) " : "";
}

export function getSourceIsPrivate(source: SourceType): boolean | undefined {
  if (source.githubRepo?.isPrivate !== undefined) {
    return source.githubRepo.isPrivate;
  }
  return source.isPrivate;
}

export function getSourceDisplayName(source: SourceType): string {
  const owner = source.githubRepo?.owner;
  const repo = source.githubRepo?.repo;
  if (owner && repo) {
    return `${owner}/${repo}`;
  }

  const repoMatch = source.name?.match(/sources\/github\/(.+)/);
  if (repoMatch) {
    return repoMatch[1];
  }

  return source.name || source.id || "Unknown";
}

/**
 * Get privacy status text for tooltip/status bar
 * @param isPrivate - The isPrivate field from Source
 * @param format - Format style ('short' for status bar, 'long' for tooltip)
 * @returns Privacy status text or empty string if undefined
 */
function getPrivacyStatusText(
  isPrivate?: boolean,
  format: "short" | "long" = "short",
): string {
  if (isPrivate === true) {
    return format === "short" ? " (Private)" : " (Private Repository)";
  } else if (isPrivate === false) {
    return format === "short" ? " (Public)" : " (Public Repository)";
  }
  return "";
}

/**
 * Get description for QuickPick source item
 * @param source - The source object
 * @returns Description text for QuickPick item
 */
function getSourceDescription(source: SourceType): string {
  const isPrivate = getSourceIsPrivate(source);
  if (isPrivate === true) {
    return "Private";
  }
  return source.url || (isPrivate === false ? "Public" : "");
}

function resolveSessionId(
  context: vscode.ExtensionContext,
  target?: SessionTreeItem | string,
): string | undefined {
  return (
    (typeof target === "string" ? target : undefined) ??
    (target instanceof SessionTreeItem ? target.session.name : undefined) ??
    context.globalState.get<string>("active-session-id")
  );
}

function extractPRs(
  sessionOrState: Session | CachedSessionState,
): PullRequestOutput[] {
  if (!sessionOrState.outputs) return [];
  const allPrs = sessionOrState.outputs
    .map((o) => o.pullRequest)
    .filter((pr): pr is PullRequestOutput => !!pr && !!pr.url);
  return Array.from(new Map(allPrs.map(pr => [pr.url, pr])).values());
}

async function checkPRStatus(
  prUrl: string,
  context: vscode.ExtensionContext,
  token?: string,
): Promise<boolean> {
  // Check cache first
  const cached = prStatusCache[prUrl];
  const now = Date.now();
  if (cached && now - cached.lastChecked < PR_CACHE_DURATION) {
    return cached.isClosed;
  }

  try {
    // Parse GitHub PR URL: https://github.com/owner/repo/pull/123
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      console.log(`Jules: Invalid GitHub PR URL format: ${prUrl}`);
      return false;
    }

    const [, owner, repo, prNumber] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

    // Prefer OAuth token
    let authToken = token;
    if (!authToken) {
      authToken = await GitHubAuth.getToken();
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetchWithTimeout(apiUrl, { headers });

    if (!response.ok) {
      console.log(
        `Jules: Failed to fetch PR status: ${response.status} ${response.statusText}`,
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
    console.error(
      `Jules: Error checking PR status for ${prUrl}:`,
      sanitizeError(error),
    );
    return false;
  }
}

async function notifyPRCreated(
  session: Session,
  prs: PullRequestOutput[],
): Promise<void> {
  if (!prs || prs.length === 0) return;

  if (prs.length === 1) {
    const pr = prs[0];
    const match = pr.url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    const repoInfoStr = match ? `[${match[2]}#${match[3]}] ` : "";
    const titleStr = pr.title ? `\nTitle: ${pr.title}` : "";
    const descPreview = pr.description
      ? `\nDesc: ${pr.description.length > 100 ? pr.description.substring(0, 100) + "..." : pr.description}`
      : "";

    const message = `PR Created! ${repoInfoStr}${titleStr}${descPreview}`;

    // Determine the actions to show
    const actions = ["Open PR"];
    if (pr.description) {
      actions.push("Copy Description");
    }

    const result = await vscode.window.showInformationMessage(
      message,
      // Increase max dialog size by using detail and modal true if necessary, but regular info message is okay
      ...actions,
    );

    if (result === "Open PR") {
      vscode.env.openExternal(vscode.Uri.parse(pr.url));
    } else if (result === "Copy Description" && pr.description) {
      await vscode.env.clipboard.writeText(pr.description);
      vscode.window.showInformationMessage(
        "PR Description copied to clipboard!",
      );
    }
  } else {
    const result = await vscode.window.showInformationMessage(
      `Session "${session.title}" has created ${prs.length} PRs!`,
      "View PRs",
    );
    if (result === "View PRs") {
      const items = prs.map((pr) => ({
        label: pr.title || pr.url,
        description: pr.url,
        detail: pr.description,
      }));
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a PR to open",
      });
      if (selected) {
        vscode.env.openExternal(vscode.Uri.parse(selected.description));
      }
    }
  }
}

async function fetchPlanFromActivities(
  sessionId: string,
  apiKey: string,
): Promise<Plan | null> {
  try {
    const activities = await fetchSessionActivitiesPaginated(apiKey, sessionId, {
      showPaginationProgress: false,
    });

    // Find the most recent planGenerated activity (reverse to get latest first)
    let planActivity: Activity | undefined;
    for (let i = activities.length - 1; i >= 0; i--) {
      if (activities[i].planGenerated) {
        planActivity = activities[i];
        break;
      }
    }
    return planActivity?.planGenerated?.plan || null;
  } catch (error) {
    console.error(
      `Jules: Error fetching plan from activities: ${sanitizeError(error)}`,
    );
    return null;
  }
}

async function notifyPlanAwaitingApproval(
  session: Session,
  context: vscode.ExtensionContext,
): Promise<void> {
  // Fetch plan details from activities
  const apiKey = await context.secrets.get("jules-api-key");
  let planDetails = "";

  if (apiKey) {
    const plan = await fetchPlanFromActivities(session.name, apiKey);
    if (plan) {
      planDetails = formatPlanForNotification(
        plan,
        MAX_PLAN_STEPS_IN_NOTIFICATION,
        MAX_PLAN_STEP_LENGTH,
      );
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
    VIEW_DETAILS_ACTION,
  );

  if (selection === "Approve Plan") {
    await approvePlan(session.name, context);
  } else if (selection === VIEW_DETAILS_ACTION) {
    await vscode.commands.executeCommand(SHOW_ACTIVITIES_COMMAND, session.name);
  }
}

async function notifyUserFeedbackRequired(session: Session): Promise<void> {
  const selection = await vscode.window.showInformationMessage(
    `Jules is waiting for your feedback in session: "${session.title}"`,
    VIEW_DETAILS_ACTION,
  );

  if (selection === VIEW_DETAILS_ACTION) {
    await vscode.commands.executeCommand(SHOW_ACTIVITIES_COMMAND, session.name);
  }
}

export function areOutputsEqual(
  a?: SessionOutput[],
  b?: SessionOutput[],
): boolean {
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

function areSessionsEqual(s1: Session, s2: Session): boolean {
  return (
    s1.state === s2.state &&
    s1.rawState === s2.rawState &&
    s1.sourceContext?.source === s2.sourceContext?.source &&
    s1.sourceContext?.githubRepoContext?.startingBranch ===
    s2.sourceContext?.githubRepoContext?.startingBranch &&
    s1.requirePlanApproval === s2.requirePlanApproval &&
    JSON.stringify(s1.sourceContext) === JSON.stringify(s2.sourceContext) &&
    areOutputsEqual(s1.outputs, s2.outputs)
  );
}

export function areSessionListsEqual(a: Session[], b: Session[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }

  // Fast path: Check equality by index
  let mismatchFound = false;
  for (let i = 0; i < a.length; i++) {
    const s1 = a[i];
    const s2 = b[i];

    if (s1 === s2) {
      continue;
    }

    // If names match, check content
    if (s1.name === s2.name) {
      if (!areSessionsEqual(s1, s2)) {
        return false;
      }
    } else {
      // Names mismatch implies potential reordering
      mismatchFound = true;
      break;
    }
  }

  // If we iterated through the whole list without mismatches (or finding differences), they are equal
  if (!mismatchFound) {
    return true;
  }

  // Slow path: Check set equality ignoring order
  const mapA = new Map(a.map((s) => [s.name, s]));

  for (const s2 of b) {
    const s1 = mapA.get(s2.name);
    if (!s1) {
      return false;
    }
    if (!areSessionsEqual(s1, s2)) {
      return false;
    }
  }
  return true;
}
export async function updatePreviousStates(
  currentSessions: Session[],
  context: vscode.ExtensionContext,
): Promise<boolean> {
  let hasChanged = false;

  // 1. Identify sessions that require PR status checks
  // We only check for sessions that are COMPLETED, have a PR URL, and are NOT already terminated.
  const sessionsToCheck = currentSessions.filter((session) => {
    const prevState = previousSessionStates.get(session.name);
    if (prevState?.isTerminated) {
      return false;
    }
    const prs = extractPRs(session);
    return session.state === "COMPLETED" && prs.length > 0;
  });

  // 2. Perform checks in parallel
  // This avoids sequential API calls (N+1 problem) when multiple sessions are completed.
  const prStatusMap = new Map<string, boolean>();

  if (sessionsToCheck.length > 0) {
    // Optimization: Fetch token once for all parallel checks to avoid
    // hitting authentication provider or secure storage repeatedly.
    const token = await GitHubAuth.getToken();

    // Optimization: Use mapLimit to process PR checks with concurrency limit.
    // This prevents rate limiting issues when checking many sessions at once.
    await mapLimit(sessionsToCheck, 5, async (session) => {
      const prs = extractPRs(session);
      // The check is redundant because `sessionsToCheck` is already filtered.
      // At least one PR is guaranteed here.
      const isClosed = prs.length > 0 && (await Promise.all(prs.map((pr) => checkPRStatus(pr.url, context, token)))).every((closed) => closed);
      prStatusMap.set(session.name, isClosed);
    });
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
      const prs = extractPRs(session);
      if (prs.length > 0) {
        // Use pre-fetched status
        const isClosed = prStatusMap.get(session.name) ?? false;
        if (isClosed) {
          isTerminated = true;
          console.log(
            `Jules: Session ${session.name} is now terminated because its PR is closed.`,
          );
          notifiedSessions.delete(session.name);
        }
      }
    } else if (session.state === "FAILED" || session.state === "CANCELLED") {
      isTerminated = true;
      console.log(
        `Jules: Session ${session.name} is now terminated due to its state: ${session.state}.`,
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
      Object.fromEntries(previousSessionStates),
    );
    // Also persist PR status cache to save API calls on next reload
    await context.globalState.update("jules.prStatusCache", prStatusCache);

    console.log(
      `Jules: Saved ${previousSessionStates.size} session states to global state.`,
    );
  }
  return hasChanged;
}

function startAutoRefresh(
  context: vscode.ExtensionContext,
  sessionsProvider: JulesSessionsProvider,
): void {
  const config = vscode.workspace.getConfiguration(
    "jules-extension.autoRefresh",
  );
  const isEnabled = config.get<boolean>("enabled");

  // 動的に間隔を選択
  const intervalSeconds = isFetchingSensitiveData
    ? config.get<number>("fastInterval", 30)
    : config.get<number>("interval", 60);
  const interval = intervalSeconds * 1000; // Convert seconds to milliseconds

  logChannel.appendLine(
    `Jules: Auto-refresh enabled=${isEnabled}, interval=${intervalSeconds}s (${interval}ms), fastMode=${isFetchingSensitiveData}`,
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
  sessionsProvider: JulesSessionsProvider,
): void {
  stopAutoRefresh();
  startAutoRefresh(context, sessionsProvider);
}

interface SessionsResponse {
  sessions?: Session[];
  nextPageToken?: string;
}

const sessionActivitiesCache: Map<string, Activity[]> = new Map();

class JulesActivitiesDocumentProvider
  implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  setContent(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
  }

  buildUri(sessionId: string): vscode.Uri {
    const normalized = sessionId.replace(/^sessions\//, "");
    return vscode.Uri.parse(`jules-activities://sessions/${normalized}/activities.log`);
  }
}

function addToActivitiesCache(sessionId: string, activities: Activity[]): void {
  // Keep cache bounded to avoid unbounded memory growth during long-lived sessions.
  if (
    sessionActivitiesCache.size >= MAX_ACTIVITIES_CACHE_SIZE &&
    !sessionActivitiesCache.has(sessionId)
  ) {
    const oldestKey = sessionActivitiesCache.keys().next().value as
      | string
      | undefined;
    if (oldestKey) {
      sessionActivitiesCache.delete(oldestKey);
    }
  }
  sessionActivitiesCache.set(sessionId, activities);
}

function getLatestSessionFailedReason(sessionId: string): string | undefined {
  const activities = sessionActivitiesCache.get(sessionId);
  if (!activities || activities.length === 0) {
    return undefined;
  }

  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const failed = activities[i].sessionFailed;
    if (!failed) {
      continue;
    }
    const rawReason = failed.reason;
    if (typeof rawReason === "string") {
      const trimmedReason = rawReason.trim();
      if (trimmedReason.length > 0) {
        return trimmedReason;
      }
    }
    continue;
  }

  return undefined;
}

async function refreshSessionActivitiesCacheFromApi(
  context: vscode.ExtensionContext,
  sessionId: string,
): Promise<void> {
  const apiKey = await getStoredApiKey(context);
  if (!apiKey) {
    return;
  }

  const latestCreateTimeKey = getActivitiesLatestCreateTimeKey(sessionId);
  const previousLatestCreateTime = context.globalState.get<string>(
    latestCreateTimeKey,
  );
  const cachedActivities = sessionActivitiesCache.get(sessionId) || [];
  const useDeltaFetch =
    !!previousLatestCreateTime && cachedActivities.length > 0;

  const newActivities = await fetchSessionActivitiesPaginated(apiKey, sessionId, {
    createTime: useDeltaFetch ? previousLatestCreateTime : undefined,
    showPaginationProgress: false,
  });

  const mergedActivities = useDeltaFetch
    ? mergeActivitiesByIdentity(cachedActivities, newActivities)
    : mergeActivitiesByIdentity([], newActivities);

  addToActivitiesCache(sessionId, mergedActivities);

  const latestCreateTime = getLatestActivityCreateTime(mergedActivities);
  if (latestCreateTime) {
    await context.globalState.update(latestCreateTimeKey, latestCreateTime);
  }
}

function getActivitiesLatestCreateTimeKey(sessionId: string): string {
  return `${ACTIVITIES_LATEST_CREATE_TIME_KEY_PREFIX}.${sessionId}`;
}

export function getLatestActivityCreateTime(
  activities: Activity[],
): string | undefined {
  let latestTime: string | undefined;
  let latestMs = Number.NEGATIVE_INFINITY;

  for (const activity of activities) {
    if (!activity.createTime) {
      continue;
    }
    const parsed = Date.parse(activity.createTime);
    if (Number.isNaN(parsed)) {
      continue;
    }
    if (parsed > latestMs) {
      latestMs = parsed;
      latestTime = activity.createTime;
    }
  }

  return latestTime;
}

export function mergeActivitiesByIdentity(
  existing: Activity[],
  incoming: Activity[],
): Activity[] {
  const mergedMap = new Map<string, Activity>();
  for (const activity of existing) {
    const key = activity.name || activity.id;
    if (key) {
      mergedMap.set(key, activity);
    }
  }
  for (const activity of incoming) {
    const key = activity.name || activity.id;
    if (key) {
      mergedMap.set(key, activity);
    }
  }

  return [...mergedMap.values()].sort((a, b) => {
    const at = Date.parse(a.createTime || "");
    const bt = Date.parse(b.createTime || "");
    if (!Number.isNaN(at) && !Number.isNaN(bt) && at !== bt) {
      return at - bt;
    }
    return (a.name || a.id || "").localeCompare(b.name || b.id || "");
  });
}

function buildActivitySummaryHeader(
  sessionState: string,
  activities: Activity[],
): string {
  const categoryCounts: Record<ActivityCategory, number> = {
    Plan: 0,
    Progress: 0,
    Artifacts: 0,
    Messages: 0,
    Errors: 0,
  };

  for (const activity of activities) {
    categoryCounts[getActivityCategory(activity)] += 1;
  }

  const latestActivity = activities.length > 0 ? activities[activities.length - 1] : undefined;
  const latestDesc = latestActivity ? getActivitySummaryText(latestActivity) : "N/A";

  return [
    "=== Session Summary ===",
    `Status: ${sessionState}`,
    `Activities: ${activities.length} (Plan: ${categoryCounts.Plan}, Progress: ${categoryCounts.Progress}, Artifacts: ${categoryCounts.Artifacts}, Messages: ${categoryCounts.Messages}, Errors: ${categoryCounts.Errors})`,
    `Latest: ${latestDesc}`,
    "========================",
    "",
  ].join("\n");
}

export function buildSessionsListEndpoint(
  baseUrl: string,
  pageToken?: string,
): string {
  const params = new URLSearchParams({ pageSize: String(MAX_PAGE_SIZE) });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }
  return `${baseUrl}/sessions?${params.toString()}`;
}

export function buildActivitiesListEndpoint(
  baseUrl: string,
  sessionId: string,
  options?: { pageToken?: string; createTime?: string },
): string {
  const params = new URLSearchParams({ pageSize: String(MAX_PAGE_SIZE) });
  if (options?.pageToken) {
    params.set("pageToken", options.pageToken);
  }
  if (options?.createTime) {
    params.set("createTime", options.createTime);
  }
  return `${baseUrl}/${sessionId}/activities?${params.toString()}`;
}

async function fetchAllSessionsPaginated(
  apiKey: string,
  showPaginationProgress: boolean,
): Promise<Session[]> {
  const doFetch = async (
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<Session[]> => {
    const allSessions: Session[] = [];
    let pageToken: string | undefined;
    let page = 0;

    do {
      page += 1;
      if (page > MAX_PAGINATION_PAGES) {
        throw new Error(
          `Pagination limit exceeded while loading sessions (>${MAX_PAGINATION_PAGES} pages).`,
        );
      }
      if (page > 1) {
        progress?.report({
          message: `Loading more sessions (page ${page})...`,
        });
      }

      const response = await fetchWithTimeout(
        buildSessionsListEndpoint(JULES_API_BASE_URL, pageToken),
        {
          method: "GET",
          headers: {
            "X-Goog-Api-Key": apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch sessions: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as SessionsResponse;
      if (!data.sessions || !Array.isArray(data.sessions)) {
        throw new Error("No sessions found or invalid response format");
      }

      allSessions.push(...data.sessions);
      pageToken = data.nextPageToken;
    } while (pageToken);

    return allSessions;
  };

  if (!showPaginationProgress) {
    return doFetch();
  }

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "Jules: Loading sessions...",
    },
    async (progress) => doFetch(progress),
  );
}

async function fetchSessionActivitiesPaginated(
  apiKey: string,
  sessionId: string,
  options?: { createTime?: string; showPaginationProgress?: boolean },
): Promise<Activity[]> {
  const doFetch = async (
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<Activity[]> => {
    const activities: Activity[] = [];
    let pageToken: string | undefined;
    let page = 0;

    do {
      page += 1;
      if (page > MAX_PAGINATION_PAGES) {
        throw new Error(
          `Pagination limit exceeded while loading activities (>${MAX_PAGINATION_PAGES} pages).`,
        );
      }
      if (page > 1) {
        progress?.report({
          message: `Loading more activities (page ${page})...`,
        });
      }

      const response = await fetchWithTimeout(
        buildActivitiesListEndpoint(JULES_API_BASE_URL, sessionId, {
          pageToken,
          createTime: options?.createTime,
        }),
        {
          method: "GET",
          headers: {
            "X-Goog-Api-Key": apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch activities: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as ActivitiesResponse;
      if (!data.activities || !Array.isArray(data.activities)) {
        throw new Error("Invalid response format from API.");
      }

      activities.push(...data.activities);
      pageToken = data.nextPageToken;
    } while (pageToken);

    return activities;
  };

  if (!options?.showPaginationProgress) {
    return doFetch();
  }

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "Jules: Loading activities...",
    },
    async (progress) => doFetch(progress),
  );
}


export class JulesSessionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private static silentOutputChannel: vscode.OutputChannel = {
    name: "silent-channel",
    append: () => { },
    appendLine: () => { },
    replace: () => { },
    clear: () => { },
    show: () => { },
    hide: () => { },
    dispose: () => { },
  };

  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private sessionsCache: Session[] = [];
  private deletingSessions: Set<string> = new Set();
  private isFetching = false;
  private lastBranchRefreshTime: number = 0;
  private readonly BRANCH_REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes
  private lastArtifactsPrefetchTime: number = 0;
  private readonly ARTIFACTS_PREFETCH_INTERVAL = 3 * 60 * 1000; // 3 minutes

  // Activity フィルタ関連のプロパティ
  private activityCategoryFilter: Set<ActivityCategory> = new Set();
  private lastSelectedSessionId: string | undefined;
  private progressStatusBarItem: vscode.StatusBarItem | undefined;

  constructor(private context: vscode.ExtensionContext) { }

  getActivityCategoryFilter(): Set<ActivityCategory> {
    return this.activityCategoryFilter;
  }

  setActivityCategoryFilter(filter: Set<ActivityCategory>): void {
    this.activityCategoryFilter = filter;
    this._onDidChangeTreeData.fire(undefined);
  }

  setLastSelectedSessionId(sessionId: string | undefined): void {
    this.lastSelectedSessionId = sessionId;
  }

  setProgressStatusBarItem(item: vscode.StatusBarItem): void {
    this.progressStatusBarItem = item;
  }

  private async updateProgressStatusBarForSelectedSession(
    apiKey: string,
    sessions: Session[],
  ): Promise<void> {
    if (!this.progressStatusBarItem || !this.lastSelectedSessionId) {
      this.progressStatusBarItem?.hide();
      return;
    }

    const selectedSession = sessions.find(
      (session) => session.name === this.lastSelectedSessionId,
    );
    if (!selectedSession || !isSessionActive(selectedSession)) {
      this.progressStatusBarItem.hide();
      return;
    }

    try {
      const sessionId = selectedSession.name;
      const latestCreateTimeKey = getActivitiesLatestCreateTimeKey(sessionId);
      const previousLatestCreateTime = this.context.globalState.get<string>(
        latestCreateTimeKey,
      );
      const cachedActivities = sessionActivitiesCache.get(sessionId) ?? [];

      const newActivities = await fetchSessionActivitiesPaginated(apiKey, sessionId, {
        createTime: previousLatestCreateTime,
        showPaginationProgress: false,
      });
      const activities = mergeActivitiesByIdentity(cachedActivities, newActivities);
      addToActivitiesCache(sessionId, activities);

      const latestCreateTime = getLatestActivityCreateTime(activities);
      if (latestCreateTime) {
        await this.context.globalState.update(latestCreateTimeKey, latestCreateTime);
      }

      const latestProgress = activities
        .filter((activity) => activity.progressUpdated)
        .sort(
          (a, b) =>
            new Date(b.createTime).getTime() - new Date(a.createTime).getTime(),
        )[0];

      if (latestProgress?.progressUpdated) {
        const title = latestProgress.progressUpdated.title || "Working...";
        this.progressStatusBarItem.text = `$(sync~spin) Jules: ${title}`;
        this.progressStatusBarItem.tooltip =
          latestProgress.progressUpdated.description || "";
        this.progressStatusBarItem.show();
      } else {
        this.progressStatusBarItem.hide();
      }
    } catch (error) {
      logChannel.appendLine(
        `Jules: Failed to update progress status bar: ${sanitizeError(error)}`,
      );
      this.progressStatusBarItem.hide();
    }
  }

  private sendNotifications(
    sessions: Session[],
    notificationType: string,
    notifier: (session: Session) => Promise<void>,
  ) {
    if (sessions.length === 0) {
      return;
    }

    logChannel.appendLine(
      `Jules: Found ${sessions.length} sessions awaiting ${notificationType}`,
    );
    for (const session of sessions) {
      if (!notifiedSessions.has(session.name)) {
        notifier(session).catch((error) => {
          logChannel.appendLine(
            `Jules: Failed to show ${notificationType} notification for session '${sanitizeForLogging(session.name)}' (${sanitizeForLogging(session.title)}): ${sanitizeError(error)}`,
          );
        });
        notifiedSessions.add(session.name);
      }
    }
  }

  private async fetchAndProcessSessions(
    isBackground: boolean = false,
    forceUIUpdate: boolean = false,
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
        this.progressStatusBarItem?.hide();
        return;
      }

      const fetchedSessions = await fetchAllSessionsPaginated(
        apiKey,
        !isBackground,
      );

      logChannel.appendLine(
        `Jules: Found ${fetchedSessions.length} total sessions`,
      );

      // Filter out sessions that are currently being deleted to prevent race conditions
      // where a background refresh re-adds a session that was optimistically removed.
      const validSessions = fetchedSessions.filter(
        (s) => !this.deletingSessions.has(s.name),
      );

      const allSessionsMapped = validSessions.map((session) => ({
        ...session,
        rawState: session.state,
        state: mapApiStateToSessionState(session.state),
      }));

      // デバッグ: 全セッションのrawStateをログ出力
      logChannel.appendLine(
        `Jules: Debug - Total sessions: ${allSessionsMapped.length}`,
      );
      const stateCounts = allSessionsMapped.reduce(
        (acc, s) => {
          acc[s.rawState] = (acc[s.rawState] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      logChannel.appendLine(
        `Jules: Debug - State counts: ${JSON.stringify(stateCounts)}`,
      );

      // --- Optimization: Check if sessions changed ---
      const sessionsChanged = !areSessionListsEqual(
        this.sessionsCache,
        allSessionsMapped,
      );

      if (sessionsChanged) {
        // Optimization: Single pass iteration over sessions to identify notification candidates
        const sessionsToNotifyPlan: Session[] = [];
        const sessionsToNotifyFeedback: Session[] = [];
        const completedSessions: Session[] = [];

        for (const session of allSessionsMapped) {
          const prevState = previousSessionStates.get(session.name);
          const isNotTerminated = !prevState?.isTerminated;

          if (!isNotTerminated) {
            continue;
          }

          // Check Plan Approval
          if (session.rawState === SESSION_STATE.AWAITING_PLAN_APPROVAL) {
            const isStateChanged =
              !prevState ||
              prevState.rawState !== SESSION_STATE.AWAITING_PLAN_APPROVAL;
            if (isStateChanged) {
              sessionsToNotifyPlan.push(session);
            }
          }

          // Check User Feedback
          if (session.rawState === SESSION_STATE.AWAITING_USER_FEEDBACK) {
            const isStateChanged =
              !prevState ||
              prevState.rawState !== SESSION_STATE.AWAITING_USER_FEEDBACK;
            if (isStateChanged) {
              sessionsToNotifyFeedback.push(session);
            }
          }

          // Check Completed
          if (
            session.state === "COMPLETED" &&
            (!prevState || prevState.state !== "COMPLETED")
          ) {
            const prs = extractPRs(session);
            if (prs.length > 0) {
              completedSessions.push(session);
            }
          }
        }

        // Notify Plan Approval
        await this.sendNotifications(
          sessionsToNotifyPlan,
          "plan approval",
          (session) => notifyPlanAwaitingApproval(session, this.context),
        );

        // Notify User Feedback
        await this.sendNotifications(
          sessionsToNotifyFeedback,
          "user feedback",
          notifyUserFeedbackRequired,
        );

        // Notify Completed (PR Created)
        if (completedSessions.length > 0) {
          logChannel.appendLine(
            `Jules: Found ${completedSessions.length} completed sessions`,
          );
          for (const session of completedSessions) {
            const prs = extractPRs(session);
            if (prs.length > 0) {
              notifyPRCreated(session, prs).catch((error) => {
                logChannel.appendLine(
                  `Jules: Failed to show PR notification: ${sanitizeError(error)}`,
                );
              });
            }
          }
        }
      }

      // --- Update previous states after all checks ---
      // We always run this to check PR status for completed sessions (external state)
      const statesChanged = await updatePreviousStates(
        allSessionsMapped,
        this.context,
      );

      // --- Update the cache ---
      this.sessionsCache = allSessionsMapped;

      await this.updateProgressStatusBarForSelectedSession(
        apiKey,
        allSessionsMapped,
      );

      // Always try to prefetch artifacts for recent sessions to ensure context menus match user expectation.
      // Optimization: Do not await to allow immediate UI update.
      void this._prefetchArtifactsForRecentSessions(apiKey, allSessionsMapped).catch(error => {
        logChannel.appendLine(`Jules: Error during background artifact prefetch: ${sanitizeError(error)}`);
      });

      if (isBackground) {
        // Errors are handled inside _refreshBranchCacheInBackground, so we call it fire-and-forget.
        // The void operator is used to intentionally ignore the promise and avoid lint errors about floating promises.
        void this._refreshBranchCacheInBackground(apiKey);
      }

      // Only fire event if meaningful change occurred
      if (sessionsChanged || statesChanged || forceUIUpdate) {
        if (forceUIUpdate && !sessionsChanged && !statesChanged) {
          logChannel.appendLine("Jules: Forcing UI update (artifacts changed)");
        }
        this._onDidChangeTreeData.fire();
      } else {
        logChannel.appendLine("Jules: No view updates required.");
      }
    } catch (error) {
      if (!isBackground) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(message);
      }
      logChannel.appendLine(
        `Jules: Error during fetchAndProcessSessions: ${sanitizeError(error)}`,
      );
      // Retain cache on error to avoid losing data
    } finally {
      this.isFetching = false;
      logChannel.appendLine(
        "Jules: Finished fetching and processing sessions.",
      );
    }
  }

  private async _refreshBranchCacheInBackground(apiKey: string): Promise<void> {
    // Optimization: Throttle background branch refresh to avoid excessive I/O and CPU usage
    // The cache TTL is 5 minutes, so we check every 4 minutes to keep it relatively fresh without polling constantly.
    const now = Date.now();
    if (now - this.lastBranchRefreshTime < this.BRANCH_REFRESH_INTERVAL) {
      return;
    }

    // Update timestamp immediately to prevent concurrent refreshes
    this.lastBranchRefreshTime = now;

    const selectedSource =
      this.context.globalState.get<SourceType>("selected-source");
    if (!selectedSource || selectedSource.id === ALL_SOURCES_ID) {
      return;
    }

    console.log(
      `Jules: Background refresh, updating branches for ${selectedSource.name}`,
    );
    try {
      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);
      // Use forceRefresh: false to respect the cache TTL (5 min).
      // The createSession command handles stale cache gracefully by re-fetching if the selected branch is missing from the remote list.
      await getBranchesForSession(
        selectedSource,
        apiClient,
        JulesSessionsProvider.silentOutputChannel,
        this.context,
        { forceRefresh: false, showProgress: false, silent: true },
      );
      console.log(
        "Jules: Branch cache updated successfully during background refresh",
      );
    } catch (error: unknown) {
      console.error(
        `Jules: Failed to update branch cache during background refresh for ${sanitizeForLogging(selectedSource.name)}: ${sanitizeError(error)}`,
      );
    }
  }

  private async _prefetchArtifactsForRecentSessions(
    apiKey: string,
    sessions: Session[],
  ): Promise<void> {
    // Throttle prefetch to avoid excessive API calls during frequent refreshes
    const now = Date.now();
    if (
      now - this.lastArtifactsPrefetchTime <
      this.ARTIFACTS_PREFETCH_INTERVAL
    ) {
      return;
    }

    // Update timestamp immediately to prevent concurrent prefetches
    this.lastArtifactsPrefetchTime = now;

    // Prefetch artifacts for the top N sessions to enable context menu items (diff/changeset)
    // without requiring the user to manually run "Show Activities".
    const TARGET_COUNT = 5;
    const targetSessions = sessions.slice(0, TARGET_COUNT);

    if (targetSessions.length === 0) {
      return;
    }

    let hasChanges = false;

    // Run fetches in parallel
    const results = await Promise.allSettled(
      targetSessions.map(async (session) => {
        const before = getCachedSessionArtifacts(session.name);
        await fetchLatestSessionArtifacts(
          apiKey,
          session.name,
          JULES_API_BASE_URL,
          session.updateTime,
        );
        const after = getCachedSessionArtifacts(session.name);

        // Check if availability of diff/changeset flipped
        const hadDiff = !!before?.latestDiff;
        const hasDiff = !!after?.latestDiff;
        const hadChangeset = !!before?.latestChangeSet;
        const hasChangeset = !!after?.latestChangeSet;

        return hadDiff !== hasDiff || hadChangeset !== hasChangeset;
      }),
    );

    // Log rejected promises for debugging and monitoring
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const session = targetSessions[index];
        console.error(
          `Jules: Failed to prefetch artifacts for session ${sanitizeForLogging(session.name)}: ${sanitizeError(result.reason)}`,
        );
      }
    });

    // If any session resulted in a relevant state change, refresh the tree
    hasChanges = results.some(
      (r) => r.status === "fulfilled" && r.value === true,
    );

    if (hasChanges) {
      console.log(
        "Jules: Artifacts updated during prefetch, triggering tree refresh.",
      );
      this._onDidChangeTreeData.fire();
    }
  }

  async refresh(
    isBackground: boolean = false,
    forceUIUpdate: boolean = false,
  ): Promise<void> {
    console.log(
      `Jules: refresh() called (isBackground: ${isBackground}, forceUIUpdate: ${forceUIUpdate}), starting fetch.`,
    );
    await this.fetchAndProcessSessions(isBackground, forceUIUpdate);
  }

  public removeSession(sessionId: string): void {
    this.sessionsCache = this.sessionsCache.filter((s) => s.name !== sessionId);
    this._onDidChangeTreeData.fire();
  }

  public markSessionAsDeleting(sessionId: string): void {
    this.deletingSessions.add(sessionId);
  }

  public unmarkSessionAsDeleting(sessionId: string): void {
    this.deletingSessions.delete(sessionId);
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
      return [];
    }

    // Now, use the cache to build the tree
    let filteredSessions: Session[] = [];

    if (selectedSource.id === ALL_SOURCES_ID) {
      filteredSessions = this.sessionsCache;
      console.log(
        `Jules: Showing all ${filteredSessions.length} sessions (All Repositories selected)`,
      );
    } else {
      filteredSessions = this.sessionsCache.filter(
        (session) => session.sourceContext?.source === selectedSource.name,
      );
      console.log(
        `Jules: Found ${filteredSessions.length} sessions for the selected source from cache`,
      );
    }

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
          `Jules: Filtered out ${filteredCount} terminated sessions (${beforeFilterCount} -> ${filteredSessions.length})`,
        );
      }
    }

    if (filteredSessions.length === 0) {
      return [];
    }

    // Retrieve full source list from cache to look up source details for each session
    // when "All repositories" is selected.
    let sourcesMap: Map<string, SourceType> | undefined;
    if (selectedSource.id === ALL_SOURCES_ID) {
      const cachedSources =
        this.context.globalState.get<SourcesCache>("jules.sources");
      if (cachedSources?.sources) {
        sourcesMap = new Map(cachedSources.sources.map((s) => [s.name, s]));
      }
    }

    return filteredSessions.map((session) => {
      let sessionSource = selectedSource;
      // If "All repositories" is selected, try to find the actual source object for this session
      if (
        selectedSource.id === ALL_SOURCES_ID &&
        session.sourceContext?.source &&
        sourcesMap
      ) {
        const foundSource = sourcesMap.get(session.sourceContext.source);
        if (foundSource) {
          sessionSource = foundSource;
        }
      }
      return new SessionTreeItem(session, sessionSource);
    });
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  // API state to icon mapping for 10 states
  private static readonly stateIconMap: Record<string, vscode.ThemeIcon> = {
    STATE_UNSPECIFIED: new vscode.ThemeIcon("question"),
    QUEUED: new vscode.ThemeIcon("watch"),
    PLANNING: new vscode.ThemeIcon("loading~spin"),
    AWAITING_PLAN_APPROVAL: new vscode.ThemeIcon("checklist"),
    AWAITING_USER_FEEDBACK: new vscode.ThemeIcon("comment-discussion"),
    IN_PROGRESS: new vscode.ThemeIcon("sync~spin"),
    PAUSED: new vscode.ThemeIcon("debug-pause"),
    FAILED: new vscode.ThemeIcon("error"),
    COMPLETED: new vscode.ThemeIcon("check"),
    CANCELLED: new vscode.ThemeIcon("close"),
  };

  public readonly prUrl: string | null;
  public readonly hasDiff: boolean;
  public readonly hasChangeset: boolean;

  constructor(
    public readonly session: Session,
    private readonly selectedSource?: SourceType,
  ) {
    super(session.title || session.name, vscode.TreeItemCollapsibleState.None);

    // Calculate prUrl once and cache it
    this.prUrl = getPullRequestUrlForSession(session);
    const cachedArtifacts = getCachedSessionArtifacts(session.name);
    this.hasDiff = Boolean(cachedArtifacts?.latestDiff);
    this.hasChangeset = Boolean(cachedArtifacts?.latestChangeSet);

    // Build tooltip using extracted utility function
    const failureReasonPreview =
      session.state === "FAILED"
        ? truncateForDisplay(getLatestSessionFailedReason(session.name) ?? "", 200)
        : undefined;

    this.tooltip = buildSessionTooltip({
      session,
      hasDiff: this.hasDiff,
      hasChangeset: this.hasChangeset,
      selectedSource: this.selectedSource,
      failureReasonPreview:
        failureReasonPreview && failureReasonPreview.length > 0
          ? failureReasonPreview
          : undefined,
    });

    this.description = session.state;
    this.iconPath = this.getIcon(session.rawState);

    // Build contextValue using array for idempotent result
    const contextValues = ["jules-session"];
    if (session.url) {
      contextValues.push("jules-session-with-url");
    }
    if (this.prUrl) {
      contextValues.push("jules-session-with-pr");
    }
    if (this.hasDiff) {
      contextValues.push("jules-session-with-diff");
    }
    if (this.hasChangeset) {
      contextValues.push("jules-session-with-changeset");
    }
    if (session.rawState === SESSION_STATE.AWAITING_PLAN_APPROVAL) {
      contextValues.push("jules-session-awaiting-plan");
    }
    if (session.state === "FAILED") {
      contextValues.push("jules-session-failed");
    }
    this.contextValue = contextValues.join(" ");

    this.command = {
      command: SHOW_ACTIVITIES_COMMAND,
      title: "Show Activities",
      arguments: [session.name],
    };
  }

  private getIcon(rawState?: string): vscode.ThemeIcon {
    if (!rawState) {
      return SessionTreeItem.stateIconMap["STATE_UNSPECIFIED"];
    }

    // Use direct mapping for all 9 states
    return (
      SessionTreeItem.stateIconMap[rawState] ||
      SessionTreeItem.stateIconMap["STATE_UNSPECIFIED"]
    );
  }
}

async function approvePlan(
  sessionId: string,
  context: vscode.ExtensionContext,
): Promise<void> {
  if (!isValidSessionId(sessionId)) {
    vscode.window.showErrorMessage(`Invalid session ID: ${sessionId}`);
    return;
  }

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
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to approve plan: ${response.status} ${response.statusText}`,
          );
        }

        vscode.window.showInformationMessage("Plan approved successfully!");

        // リフレッシュして最新状態を取得
        await vscode.commands.executeCommand("jules-extension.refreshSessions");
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred.";
    vscode.window.showErrorMessage(`Error approving plan: ${message}`);
  }
}

async function sendMessageToSession(
  context: vscode.ExtensionContext,
  target?: SessionTreeItem | string,
): Promise<void> {
  const apiKey = await getStoredApiKey(context);
  if (!apiKey) {
    return;
  }

  const sessionId = resolveSessionId(context, target);
  if (!sessionId) {
    vscode.window.showErrorMessage(
      "No active session available. Please create or select a session first.",
    );
    return;
  }

  if (!isValidSessionId(sessionId)) {
    vscode.window.showErrorMessage(`Invalid session ID: ${sessionId}`);
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
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          const message =
            errorText || `${response.status} ${response.statusText}`;
          throw new Error(message);
        }

        vscode.window.showInformationMessage("Message sent successfully!");
      },
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
  statusBarItem: vscode.StatusBarItem,
) {
  const selectedSource = context.globalState.get<SourceType>("selected-source");

  if (selectedSource) {
    if (selectedSource.id === ALL_SOURCES_ID) {
      statusBarItem.text = `$(repo) Jules: All Repositories`;
      statusBarItem.tooltip = `Current Source: All Repositories\nClick to change source`;
      statusBarItem.show();
    } else {
      const repoName = getSourceDisplayName(selectedSource);
      const isPrivate = getSourceIsPrivate(selectedSource);
      const lockIcon = getPrivacyIcon(isPrivate);
      const privacyStatus = getPrivacyStatusText(
        isPrivate,
        "short",
      );

      statusBarItem.text = `$(repo) Jules: ${lockIcon}${repoName}`;
      statusBarItem.tooltip = `Current Source: ${repoName}${privacyStatus}\nClick to change source`;
      statusBarItem.show();
    }
  } else {
    statusBarItem.text = `$(repo) Jules: No source selected`;
    statusBarItem.tooltip = "Click to select a source";
    statusBarItem.show();
  }
}

export async function handleOpenInWebApp(
  item: SessionTreeItem | undefined,
  logChannel: vscode.OutputChannel,
) {
  if (!item || !(item instanceof SessionTreeItem)) {
    vscode.window.showErrorMessage("No session selected.");
    return;
  }
  const session = item.session;
  if (session.url) {
    const success = await vscode.env.openExternal(
      vscode.Uri.parse(session.url),
    );
    if (!success) {
      logChannel.appendLine(
        `[Jules] Failed to open external URL: ${session.url}`,
      );
      vscode.window.showWarningMessage(
        "Failed to open the URL in the browser.",
      );
    }
  } else {
    vscode.window.showWarningMessage("No URL is available for this session.");
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
/**
 * 環境変数からSOCKSプロキシが設定されているか確認し、最初に見つかった値を返す。
 * 設定されていない場合は null を返す。
 */
function detectSocksProxy(): string | null {
  const proxyEnvVars: (string | undefined)[] = [
    process.env.HTTP_PROXY,
    process.env.http_proxy,
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.ALL_PROXY,
    process.env.all_proxy,
  ];
  // VS Code の http.proxy 設定も検出対象に含める
  const vsCodeProxy = vscode.workspace.getConfiguration('http').get<string>('proxy');
  if (vsCodeProxy) {
    proxyEnvVars.push(vsCodeProxy);
  }
  const socksSchemes = ['socks://', 'socks4://', 'socks5://'];
  // 大文字小文字を無視してスキームをマッチング
  return proxyEnvVars.find(v => v && socksSchemes.some(s => v.toLowerCase().startsWith(s))) ?? null;
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Jules Extension is now active");

  // SOCKSプロキシ検出と設定
  const socksProxy = detectSocksProxy();
  if (socksProxy) {
    try {
      new URL(socksProxy);
    } catch {
      console.error(`Jules: Invalid SOCKS proxy URL: ${stripUrlCredentials(socksProxy)}`);
      return;
    }
    setSocksProxy(socksProxy);
    const safeProxy = stripUrlCredentials(socksProxy);
    vscode.window.showInformationMessage(
      `SOCKSプロキシ（${safeProxy}）経由で接続します。`
    );
  }

  // Load PR status cache to avoid redundant GitHub API calls on startup
  prStatusCache = context.globalState.get<PRStatusCache>(
    "jules.prStatusCache",
    {},
  );
  // Clean up expired entries
  const now = Date.now();
  const expiredUrls = Object.keys(prStatusCache).filter(
    (url) => now - prStatusCache[url].lastChecked > PR_CACHE_DURATION,
  );

  if (expiredUrls.length > 0) {
    expiredUrls.forEach((url) => delete prStatusCache[url]);
    console.log(
      `Jules: Cleaned up ${expiredUrls.length} expired PR status cache entries.`,
    );
  }

  loadPreviousSessionStates(context);
  initializeSessionArtifactsCacheFromGlobalState(context.globalState);

  const sessionsProvider = new JulesSessionsProvider(context);
  const sessionsTreeView = vscode.window.createTreeView("julesSessionsView", {
    treeDataProvider: sessionsProvider,
    showCollapseAll: false,
  });
  console.log("Jules: TreeView created");

  // ステータスバーアイテム作成
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.command = "jules-extension.listSources";
  context.subscriptions.push(statusBarItem);

  const progressStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50,
  );
  progressStatusBarItem.name = "Jules Progress";
  progressStatusBarItem.hide();
  context.subscriptions.push(progressStatusBarItem);
  sessionsProvider.setProgressStatusBarItem(progressStatusBarItem);

  const activitiesProvider = new JulesActivitiesDocumentProvider();
  const activitiesProviderDisposable =
    vscode.workspace.registerTextDocumentContentProvider(
      "jules-activities",
      activitiesProvider,
    );

  const treeSelectionDisposable = sessionsTreeView.onDidChangeSelection(
    (event) => {
      const selectedSessionItem = event.selection.find(
        (item): item is SessionTreeItem => item instanceof SessionTreeItem,
      );
      sessionsProvider.setLastSelectedSessionId(
        selectedSessionItem?.session.name,
      );
      if (!selectedSessionItem) {
        progressStatusBarItem.hide();
      }
    },
  );

  // 初期表示を更新
  updateStatusBar(context, statusBarItem);

  // Set initial context for welcome views
  const selectedSource = context.globalState.get("selected-source");
  vscode.commands.executeCommand(
    "setContext",
    "jules-extension.hasSelectedSource",
    !!selectedSource,
  );

  // Create OutputChannel for Activities
  const activitiesChannel =
    vscode.window.createOutputChannel("Jules Activities");
  context.subscriptions.push(activitiesChannel);

  // Create OutputChannel for Logs
  logChannel = vscode.window.createOutputChannel("Jules Extension Logs");
  context.subscriptions.push(logChannel);

  // Sign in to GitHub via VS Code authentication
  const signInDisposable = vscode.commands.registerCommand(
    "jules-extension.signInGitHub",
    async () => {
      const token = await GitHubAuth.signIn();
      if (token) {
        const userInfo = await GitHubAuth.getUserInfo();
        vscode.window.showInformationMessage(
          `Signed in to GitHub as ${userInfo?.login || "user"}`,
        );
        logChannel.appendLine(
          `[Jules] Signed in to GitHub as ${userInfo?.login}`,
        );
      }
    },
  );
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
    },
  );

  const verifyApiKeyDisposable = vscode.commands.registerCommand(
    "jules-extension.verifyApiKey",
    async () => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }
      try {
        const response = await fetchWithTimeout(
          `${JULES_API_BASE_URL}/sources`,
          {
            method: "GET",
            headers: {
              "X-Goog-Api-Key": apiKey,
              "Content-Type": "application/json",
            },
          },
        );
        if (response.ok) {
          vscode.window.showInformationMessage("API Key is valid.");
        } else {
          vscode.window.showErrorMessage(
            "API Key is invalid. Please check and set a correct key.",
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          "Failed to verify API Key. Please check your internet connection.",
        );
      }
    },
  );

  const listSourcesDisposable = vscode.commands.registerCommand(
    "jules-extension.listSources",
    async (filter?: string) => {
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }

      isFetchingSensitiveData = true;
      resetAutoRefresh(context, sessionsProvider);

      try {
        const cacheKey = "jules.sources";
        const cached = context.globalState.get<SourcesCache>(cacheKey);
        let sources: SourceType[];

        if (cached && isCacheValid(cached.timestamp)) {
          logChannel.appendLine("Using cached sources");
          sources = cached.sources;
        } else {
          const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);
          sources = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Fetching sources...",
              cancellable: false,
            },
            async () => {
              const data = await apiClient.listAllSources({ filter });
              await context.globalState.update(cacheKey, {
                sources: data,
                timestamp: Date.now(),
              });
              logChannel.appendLine(`Fetched ${data.length} sources`);
              return data;
            },
          );
        }

        if (!sources || sources.length === 0) {
          vscode.window.showWarningMessage(
            "No Jules-connected repositories were found.",
          );
          return;
        }

        const items: SourceQuickPickItem[] = sources.map((source) => {
          const repoName = getSourceDisplayName(source);
          const isPrivate = getSourceIsPrivate(source);

          return {
            label: isPrivate === true ? `$(lock) ${repoName}` : repoName,
            description: getSourceDescription(source),
            detail: source.description || "",
            source: source,
          };
        });

        // Add "All repositories" option
        const allRepoItem: SourceQuickPickItem = {
          label: "All repositories",
          description: "Show sessions from all sources",
          source: {
            id: ALL_SOURCES_ID,
            name: "All repositories",
          } as SourceType,
        };
        items.unshift(allRepoItem);

        const selected: SourceQuickPickItem | undefined =
          await vscode.window.showQuickPick(items, {
            placeHolder: "Select a Jules Source",
          });
        if (selected) {
          await context.globalState.update("selected-source", selected.source);
          vscode.commands.executeCommand(
            "setContext",
            "jules-extension.hasSelectedSource",
            true,
          );
          vscode.window.showInformationMessage(
            `Selected source: ${selected.label}`,
          );
          updateStatusBar(context, statusBarItem);
          sessionsProvider.refresh();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred.";
        logChannel.appendLine(`Failed to list sources: ${message}`);

        const cacheKey = "jules.sources";
        const cached = context.globalState.get<SourcesCache>(cacheKey);
        if (cached?.sources?.length) {
          const useCached = await vscode.window.showWarningMessage(
            `Failed to fetch latest sources: ${message}`,
            "Use Cached Sources",
            "Cancel",
          );

          if (useCached === "Use Cached Sources") {
            const items: SourceQuickPickItem[] = cached.sources.map((source) => {
              const repoName = getSourceDisplayName(source);
              const isPrivate = getSourceIsPrivate(source);
              return {
                label: isPrivate === true ? `$(lock) ${repoName}` : repoName,
                description: getSourceDescription(source),
                detail: source.description || "",
                source,
              };
            });

            const allRepoItem: SourceQuickPickItem = {
              label: "All repositories",
              description: "Show sessions from all sources",
              source: {
                id: ALL_SOURCES_ID,
                name: "All repositories",
              } as SourceType,
            };
            items.unshift(allRepoItem);

            const selected: SourceQuickPickItem | undefined =
              await vscode.window.showQuickPick(items, {
                placeHolder: "Select a Jules Source (cached)",
              });
            if (selected) {
              await context.globalState.update("selected-source", selected.source);
              vscode.commands.executeCommand(
                "setContext",
                "jules-extension.hasSelectedSource",
                true,
              );
              vscode.window.showInformationMessage(
                `Selected source (cached): ${selected.label}`,
              );
              updateStatusBar(context, statusBarItem);
              sessionsProvider.refresh();
            }
            return;
          }
        }

        vscode.window.showErrorMessage(`Failed to list sources: ${message}`);
      } finally {
        isFetchingSensitiveData = false;
        resetAutoRefresh(context, sessionsProvider);
      }
    },
  );

  const createSessionDisposable = vscode.commands.registerCommand(
    "jules-extension.createSession",
    async () => {
      const selectedSource = context.globalState.get(
        "selected-source",
      ) as SourceType;
      if (!selectedSource) {
        vscode.window.showErrorMessage(
          "No source selected. Please list and select a source first.",
        );
        return;
      }

      if (selectedSource.id === ALL_SOURCES_ID) {
        vscode.window.showErrorMessage(
          "Please select a specific repository to create a session.",
        );
        return;
      }

      const apiKey = await context.secrets.get("jules-api-key");
      if (!apiKey) {
        vscode.window.showErrorMessage(
          'API Key not found. Please set it first using "Set Jules API Key" command.',
        );
        return;
      }

      const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

      isFetchingSensitiveData = true;
      resetAutoRefresh(context, sessionsProvider);
      try {
        // ブランチ選択ロジック（メッセージ入力前に移動）
        const {
          branches,
          defaultBranch: selectedDefaultBranch,
          currentBranch,
          remoteBranches,
        } = await getBranchesForSession(
          selectedSource,
          apiClient,
          logChannel,
          context,
          { showProgress: true },
        );

        // QuickPickでブランチ選択
        const selectedBranch = await vscode.window.showQuickPick(
          branches.map((branch) => ({
            label: branch,
            picked: branch === selectedDefaultBranch,
            description:
              (branch === selectedDefaultBranch ? "(default)" : undefined) ||
              (branch === currentBranch ? "(current)" : undefined),
          })),
          {
            placeHolder: "Select a branch for this session",
            title: "Branch Selection",
          },
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
          logChannel.appendLine(
            `[Jules] Branch "${startingBranch}" not found in cached remote branches, re-fetching...`,
          );

          // リモートブランチを再取得（キャッシュを無視）
          const freshBranchInfo = await getBranchesForSession(
            selectedSource,
            apiClient,
            logChannel,
            context,
            { forceRefresh: true, showProgress: true },
          );
          currentRemoteBranches = freshBranchInfo.remoteBranches;

          logChannel.appendLine(
            `[Jules] Re-fetched ${currentRemoteBranches.length} remote branches`,
          );
        }

        if (!new Set(currentRemoteBranches).has(startingBranch)) {
          // ローカル専用ブランチの場合
          logChannel.appendLine(
            `[Jules] Warning: Branch "${startingBranch}" not found on remote`,
          );

          const action = await vscode.window.showWarningMessage(
            `Branch "${startingBranch}" exists locally but has not been pushed to remote.\n\nJules requires a remote branch to start a session.`,
            { modal: true },
            "Create Remote Branch",
            "Use Default Branch",
          );

          if (action === "Create Remote Branch") {
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
                    logChannel,
                  );
                  progress.report({
                    increment: 100,
                    message: "Remote branch created!",
                  });
                },
              );
              logChannel.appendLine(
                `[Jules] Remote branch "${startingBranch}" created successfully`,
              );
              vscode.window.showInformationMessage(
                `Remote branch "${startingBranch}" created successfully.`,
              );

              // Force refresh branches cache after remote branch creation
              try {
                await getBranchesForSession(
                  selectedSource,
                  apiClient,
                  logChannel,
                  context,
                  { forceRefresh: true, showProgress: true },
                );
                logChannel.appendLine(
                  "[Jules] Branches cache refreshed after remote branch creation",
                );
              } catch (error) {
                logChannel.appendLine(
                  `[Jules] Failed to refresh branches cache: ${sanitizeError(error)}`,
                );
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              logChannel.appendLine(
                `[Jules] Failed to create remote branch: ${errorMessage}`,
              );
              vscode.window.showErrorMessage(
                `Failed to create remote branch: ${errorMessage}`,
              );
              return;
            }
          } else if (action === "Use Default Branch") {
            startingBranch = selectedDefaultBranch;
            logChannel.appendLine(
              `[Jules] Using default branch: ${sanitizeForLogging(selectedDefaultBranch)}`,
            );
          } else {
            logChannel.appendLine("[Jules] Session creation cancelled by user");
            return;
          }
        } else {
          logChannel.appendLine(
            `[Jules] Branch "${startingBranch}" found on remote`,
          );
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
            "Task description was empty. Session not created.",
          );
          return;
        }
        const finalPrompt = buildFinalPrompt(userPrompt);
        const title = userPrompt.split("\n")[0];
        const automationMode = result.createPR ? "AUTO_CREATE_PR" : "MANUAL";

        if (!selectedSource.name) {
          throw new Error(
            "Selected source is missing resource name required by Sources API.",
          );
        }

        const requestBody: CreateSessionRequest = {
          prompt: finalPrompt,
          sourceContext: {
            source: selectedSource.name,
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
            const response = await fetchWithTimeout(
              `${JULES_API_BASE_URL}/sessions`,
              {
                method: "POST",
                headers: {
                  "X-Goog-Api-Key": apiKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
              },
            );
            progress.report({
              increment: 50,
              message: "Processing response...",
            });
            if (!response.ok) {
              throw new Error(
                `Failed to create session: ${response.status} ${response.statusText}`,
              );
            }
            const session = (await response.json()) as SessionResponse;
            await context.globalState.update("active-session-id", session.name);
            progress.report({
              increment: 100,
              message: "Session created!",
            });
            vscode.window.showInformationMessage(
              `Session created: ${session.name}`,
            );
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create session: ${error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      } finally {
        isFetchingSensitiveData = false;
        resetAutoRefresh(context, sessionsProvider);
      }
    },
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
    },
  );
  context.subscriptions.push(onDidChangeConfiguration);

  const refreshSessionsDisposable = vscode.commands.registerCommand(
    "jules-extension.refreshSessions",
    () => {
      sessionsProvider.refresh(false); // Pass false for manual refresh
    },
  );

  const filterActivitiesCommand = vscode.commands.registerCommand(
    "jules.filterActivities",
    async () => {
      const categories: ActivityCategory[] = [
        "Plan",
        "Progress",
        "Artifacts",
        "Messages",
        "Errors",
      ];
      const currentFilter = sessionsProvider.getActivityCategoryFilter();

      const items = categories.map((category) => ({
        label: category,
        picked: currentFilter.size === 0 || currentFilter.has(category),
      }));

      const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: "フィルタするActivityカテゴリを選択（未選択＝全表示）",
      });

      if (selected !== undefined) {
        const newFilter = new Set<ActivityCategory>(
          selected.map((item) => item.label as ActivityCategory),
        );
        sessionsProvider.setActivityCategoryFilter(newFilter);
      }
    },
  );

  const showActivitiesDisposable = vscode.commands.registerCommand(
    "jules-extension.showActivities",
    async (sessionId: string) => {
      if (!isValidSessionId(sessionId)) {
        vscode.window.showErrorMessage(`Invalid session ID: ${sessionId}`);
        return;
      }

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
          },
        );
        if (!sessionResponse.ok) {
          const errorText = await sessionResponse.text();
          vscode.window.showErrorMessage(
            `Session not found: ${sessionResponse.status} ${sessionResponse.statusText} - ${errorText}`,
          );
          return;
        }
        const sessionDetails = (await sessionResponse.json()) as {
          state?: string;
        };

        const latestCreateTimeKey = getActivitiesLatestCreateTimeKey(sessionId);
        const previousLatestCreateTime = context.globalState.get<string>(
          latestCreateTimeKey,
        );
        const cachedActivities = sessionActivitiesCache.get(sessionId) || [];
        const useDeltaFetch =
          !!previousLatestCreateTime && cachedActivities.length > 0;

        const newActivities = await fetchSessionActivitiesPaginated(
          apiKey,
          sessionId,
          {
            createTime: useDeltaFetch ? previousLatestCreateTime : undefined,
            showPaginationProgress: true,
          },
        );

        const mergedActivities = useDeltaFetch
          ? mergeActivitiesByIdentity(cachedActivities, newActivities)
          : mergeActivitiesByIdentity([], newActivities);

        let filteredActivities = mergedActivities;
        const currentFilter = sessionsProvider.getActivityCategoryFilter();
        if (currentFilter.size > 0) {
          filteredActivities = mergedActivities.filter((activity) =>
            currentFilter.has(getActivityCategory(activity)),
          );
        }

        addToActivitiesCache(sessionId, mergedActivities);

        const latestCreateTime = getLatestActivityCreateTime(mergedActivities);
        if (latestCreateTime) {
          await context.globalState.update(latestCreateTimeKey, latestCreateTime);
        }

        const artifactsChanged = updateSessionArtifactsCache(
          sessionId,
          mergedActivities,
        );

        if (artifactsChanged) {
          // Force TreeView update with forceUIUpdate=true
          sessionsProvider.refresh(true, true);
        }
        activitiesChannel.clear();
        activitiesChannel.show();
        activitiesChannel.appendLine(`Activities for session: ${sessionId}`);
        activitiesChannel.appendLine("---");
        const detailLines: string[] = [];
        if (filteredActivities.length === 0) {
          activitiesChannel.appendLine("No activities found for this session.");
          detailLines.push("No activities found for this session.");
        } else {
          let planDetected = false;
          filteredActivities.forEach((activity) => {
            const icon = getActivityIcon(activity);
            const codicon = getActivityThemeIcon(activity)?.id;
            const timestamp = new Date(activity.createTime).toLocaleString();
            const originator = activity.originator ?? "unknown";
            const activeKeys = getActiveActivityKeys(activity);
            const summary = getActivitySummaryText(activity);
            let message = "";
            const detailLinesForActivity: string[] = [];

            if (activeKeys.length === 1) {
              switch (activeKeys[0]) {
                case "planGenerated": {
                  const planTitle = activity.planGenerated?.plan?.title;
                  message = `Plan generated: ${planTitle || summary}`;
                  planDetected = true;
                  break;
                }
                case "planApproved": {
                  const planId = activity.planApproved?.planId;
                  message = `Plan approved: ${planId || summary}`;
                  break;
                }
                case "progressUpdated": {
                  const progressText = pickFirstNonEmpty(
                    activity.progressUpdated?.title,
                    activity.progressUpdated?.description,
                  );
                  message = progressText
                    ? `Progress: ${summary}`
                    : `ℹ️ ${summary}`;
                  break;
                }
                case "sessionCompleted": {
                  message = `Completed: ${summary}`;
                  break;
                }
                case "sessionFailed": {
                  message = "Session failed";
                  const failureReason = pickFirstNonEmpty(
                    activity.sessionFailed?.reason,
                  );
                  if (failureReason && failureReason.length > 0) {
                    detailLinesForActivity.push(`  Reason: ${failureReason}`);
                  }
                  break;
                }
                case "agentMessaged": {
                  const text =
                    pickFirstNonEmpty(activity.agentMessaged?.agentMessage) ??
                    "(no message)";
                  message = `Agent message: ${truncateForDisplay(text)}`;
                  break;
                }
                case "userMessaged": {
                  const text =
                    pickFirstNonEmpty(activity.userMessaged?.userMessage) ??
                    "(no message)";
                  message = `User message: ${truncateForDisplay(text)}`;
                  break;
                }
                default: {
                  message = "Unknown activity";
                }
              }
            } else {
              let keySummary = activeKeys.join(", ");
              if (activeKeys.length === 0) {
                const baseKeys = new Set([
                  "name",
                  "createTime",
                  "description",
                  "originator",
                  "id",
                  "type",
                  "artifacts",
                ]);
                const unionKeys = new Set(ACTIVITY_UNION_KEYS);
                const inferredKeys = Object.keys(activity).filter((key) => {
                  if (
                    baseKeys.has(key) ||
                    unionKeys.has(key as ActivityUnionKey)
                  ) {
                    return false;
                  }
                  const value = (
                    activity as unknown as Record<string, unknown>
                  )[key];
                  return value !== undefined && value !== null;
                });
                keySummary =
                  inferredKeys.length === 0 ? "none" : inferredKeys.join(", ");
              }

              let rawForLog = "";
              try {
                const safeActivity = {
                  ...activity,
                  agentMessaged: activity.agentMessaged
                    ? {
                      ...activity.agentMessaged,
                      agentMessage: activity.agentMessaged.agentMessage
                        ? "[REDACTED]"
                        : activity.agentMessaged.agentMessage,
                    }
                    : activity.agentMessaged,
                  userMessaged: activity.userMessaged
                    ? {
                      ...activity.userMessaged,
                      userMessage: activity.userMessaged.userMessage
                        ? "[REDACTED]"
                        : activity.userMessaged.userMessage,
                    }
                    : activity.userMessaged,
                };
                rawForLog = JSON.stringify(safeActivity);
                const sanitizedRaw = sanitizeForLogging(rawForLog);
                const truncatedRaw = truncateForDisplay(sanitizedRaw, 2000);
                logChannel.appendLine(
                  `Jules: Unknown activity raw (sanitized, truncated):\n${truncatedRaw}`,
                );
              } catch (error) {
                logChannel.appendLine(
                  `Jules: Unknown activity raw stringify failed: ${sanitizeError(error)}`,
                );
              }
              message = `Unknown activity (keys: ${keySummary}). See output log for details.`;
            }

            const prefix = getActivityLabelPrefix(activity);
            const iconPrefix = codicon ? `$(${codicon}) ` : "";
            const line = `${iconPrefix}${icon} ${timestamp} (${originator}): ${prefix}${message}`;
            activitiesChannel.appendLine(line);
            detailLines.push(line);
            if (detailLinesForActivity.length > 0) {
              detailLinesForActivity.forEach((detailLine) => {
                activitiesChannel.appendLine(detailLine);
                detailLines.push(detailLine);
              });
            }
          });

          if (planDetected) {
            logChannel.appendLine(
              `Jules: Plan-related activities detected for ${sanitizeForLogging(sessionId)}`,
            );
          }
        }

        const summaryHeader = buildActivitySummaryHeader(
          sessionDetails.state ?? "UNKNOWN",
          mergedActivities,
        );
        const activitiesUri = activitiesProvider.buildUri(sessionId);
        activitiesProvider.setContent(
          activitiesUri,
          summaryHeader + detailLines.join("\n"),
        );
        const activitiesDocument = await vscode.workspace.openTextDocument(
          activitiesUri,
        );
        await vscode.window.showTextDocument(activitiesDocument, {
          preview: true,
          viewColumn: vscode.ViewColumn.Active,
        });

        await context.globalState.update("active-session-id", sessionId);
      } catch (error) {
        vscode.window.showErrorMessage(
          "Failed to fetch activities. Please check your internet connection.",
        );
      }
    },
  );

  const refreshActivitiesDisposable = vscode.commands.registerCommand(
    "jules-extension.refreshActivities",
    async () => {
      const currentSessionId = context.globalState.get(
        "active-session-id",
      ) as string;
      if (!currentSessionId) {
        vscode.window.showErrorMessage(
          "No current session selected. Please show activities first.",
        );
        return;
      }
      await vscode.commands.executeCommand(
        "jules-extension.showActivities",
        currentSessionId,
      );
    },
  );

  const showFailureReasonDisposable = vscode.commands.registerCommand(
    "jules.showFailureReason",
    async (item?: SessionTreeItem) => {
      if (!item || !(item instanceof SessionTreeItem)) {
        vscode.window.showErrorMessage("No session selected.");
        return;
      }

      let reasonRaw = getLatestSessionFailedReason(item.session.name);
      let reason = reasonRaw?.trim();

      if (!reason) {
        try {
          await refreshSessionActivitiesCacheFromApi(context, item.session.name);
          reasonRaw = getLatestSessionFailedReason(item.session.name);
          reason = reasonRaw?.trim();
        } catch (error) {
          logChannel.appendLine(
            `Jules: Failed to refresh activities for failure reason: ${sanitizeError(error)}`,
          );
        }
      }

      if (!reason) {
        vscode.window.showInformationMessage("Failure reason is not available.");
        return;
      }

      const selection = await vscode.window.showInformationMessage(
        `Jules Session Failed\n\n${reason}`,
        { modal: true },
        "Copy",
      );

      if (selection === "Copy") {
        await vscode.env.clipboard.writeText(reason);
        vscode.window.showInformationMessage(
          "Failure reason copied to clipboard.",
        );
      }
    },
  );

  const sendMessageDisposable = vscode.commands.registerCommand(
    "jules-extension.sendMessage",
    async (item?: SessionTreeItem | string) => {
      await sendMessageToSession(context, item);
    },
  );

  const approvePlanDisposable = vscode.commands.registerCommand(
    "jules-extension.approvePlan",
    async () => {
      const sessionId = context.globalState.get<string>("active-session-id");
      if (!sessionId) {
        vscode.window.showErrorMessage(
          "No active session. Please select a session first.",
        );
        return;
      }
      await approvePlan(sessionId, context);
    },
  );

  const openSettingsDisposable = vscode.commands.registerCommand(
    "jules-extension.openSettings",
    () => {
      return vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:HirokiMukai.jules-extension",
      );
    },
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
        `Are you sure you want to delete session "${session.title}"?\n\nThis will permanently delete the session from the server.`,
        { modal: true },
        "Delete",
      );

      if (confirm !== "Delete") {
        return;
      }

      if (!isValidSessionId(session.name)) {
        vscode.window.showErrorMessage(`Invalid session ID: ${session.name}`);
        return;
      }

      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }

      // Perform background server deletion
      try {
        // Mark as deleting to prevent background refresh from restoring it
        sessionsProvider.markSessionAsDeleting(session.name);

        // Optimistic UI update: Remove from local view immediately
        sessionsProvider.removeSession(session.name);

        const response = await fetchWithTimeout(
          `${JULES_API_BASE_URL}/${session.name}`,
          {
            method: "DELETE",
            headers: {
              "X-Goog-Api-Key": apiKey,
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          const safeDisplayText = truncateForDisplay(
            sanitizeForLogging(errorText),
          );
          throw new Error(
            `Failed to delete session on server: ${response.status} ${response.statusText} - ${safeDisplayText}`,
          );
        }

        // On success, permanently remove from previous states to prevent re-notification.
        previousSessionStates.delete(session.name);
        notifiedSessions.delete(session.name);
        await context.globalState.update(
          "jules.previousSessionStates",
          Object.fromEntries(previousSessionStates),
        );

        // Clear active session if the deleted session was the active one
        const activeSessionId =
          context.globalState.get<string>("active-session-id");
        if (activeSessionId === session.name) {
          await context.globalState.update("active-session-id", undefined);
        }

        // Remove from deleting set (it's gone now, so filter doesn't matter, but good cleanup)
        sessionsProvider.unmarkSessionAsDeleting(session.name);

        vscode.window.showInformationMessage(
          `Session "${session.title}" deleted successfully.`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        vscode.window.showErrorMessage(`Error deleting session: ${message}`);

        // Unmark so it can be restored
        sessionsProvider.unmarkSessionAsDeleting(session.name);

        // Revert/Refresh to restore state from server if delete failed
        // Use background=true to avoid duplicate error messages about missing API key (though we checked it above)
        sessionsProvider.refresh(true);
      }
    },
  );


  const clearCacheDisposable = vscode.commands.registerCommand(
    "jules-extension.clearCache",
    async () => {
      try {
        // すべてのキーを取得
        const allKeys = context.globalState.keys();

        // Sources & Branches キャッシュをフィルタ
        const branchCacheKeys = allKeys.filter((key) =>
          key.startsWith("jules.branches."),
        );
        const cacheKeys = ["jules.sources", ...branchCacheKeys];

        // すべてのキャッシュをクリア
        await Promise.all(
          cacheKeys.map((key) => context.globalState.update(key, undefined)),
        );

        vscode.window.showInformationMessage(
          `Jules cache cleared: ${cacheKeys.length} entries removed`,
        );
        logChannel.appendLine(
          `[Jules] Cache cleared: ${cacheKeys.length} entries (1 sources + ${branchCacheKeys.length} branches)`,
        );
      } catch (error: any) {
        logChannel.appendLine(`[Jules] Error clearing cache: ${error.message}`);
        vscode.window.showErrorMessage(
          `Failed to clear cache: ${error.message}`,
        );
      }
    },
  );

  const openInWebAppDisposable = vscode.commands.registerCommand(
    "jules-extension.openInWebApp",
    (item?: SessionTreeItem) => handleOpenInWebApp(item, logChannel),
  );

  const openPRInBrowserDisposable = vscode.commands.registerCommand(
    "jules-extension.openPRInBrowser",
    async (item?: SessionTreeItem) => {
      if (!item || !(item instanceof SessionTreeItem)) {
        vscode.window.showErrorMessage("No session selected.");
        return;
      }
      if (item.prUrl) {
        await openPullRequestInBrowser(item.prUrl);
      } else {
        vscode.window.showErrorMessage(
          "No pull request URL available for this session.",
        );
      }
    },
  );

  const checkoutToBranchDisposable = vscode.commands.registerCommand(
    "jules-extension.checkoutToBranch",
    async (item?: SessionTreeItem) => {
      if (!item || !(item instanceof SessionTreeItem)) {
        vscode.window.showErrorMessage("No session selected.");
        return;
      }
      // Use session-aware checkout that leverages GitHub API for PR branch info
      await checkoutToBranchForSession(item.session, logChannel);
    },
  );

  const diffProvider = new JulesDiffDocumentProvider();
  const diffProviderDisposable =
    vscode.workspace.registerTextDocumentContentProvider(
      "jules-diff",
      diffProvider,
    );

  const openLatestDiffDisposable = vscode.commands.registerCommand(
    "jules-extension.openLatestDiff",
    async (item?: SessionTreeItem | string) => {
      const sessionId = resolveSessionId(context, item);
      if (!sessionId) {
        vscode.window.showErrorMessage("No session selected.");
        return;
      }
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }
      const sessionTitle =
        item instanceof SessionTreeItem ? item.session.title : undefined;
      await openLatestDiffForSession({
        sessionId,
        sessionTitle,
        apiKey,
        apiBaseUrl: JULES_API_BASE_URL,
        logChannel,
        diffProvider,
      });
    },
  );

  const openChangesetDisposable = vscode.commands.registerCommand(
    "jules-extension.openChangeset",
    async (item?: SessionTreeItem | string) => {
      const sessionId = resolveSessionId(context, item);
      if (!sessionId) {
        vscode.window.showErrorMessage("No session selected.");
        return;
      }
      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }
      const sessionTitle =
        item instanceof SessionTreeItem ? item.session.title : undefined;
      await openChangesetForSession({
        sessionId,
        sessionTitle,
        apiKey,
        apiBaseUrl: JULES_API_BASE_URL,
        logChannel,
      });
    },
  );

  // Plan review provider for displaying plan content in virtual documents
  const planProvider = new JulesPlanDocumentProvider();
  const planProviderDisposable =
    vscode.workspace.registerTextDocumentContentProvider(
      "jules-plan",
      planProvider,
    );

  const reviewPlanDisposable = vscode.commands.registerCommand(
    "jules-extension.reviewPlan",
    async (item?: SessionTreeItem) => {
      if (!item || !(item instanceof SessionTreeItem)) {
        vscode.window.showErrorMessage("No session selected.");
        return;
      }

      const apiKey = await getStoredApiKey(context);
      if (!apiKey) {
        return;
      }

      // Fetch plan with progress indicator
      const plan = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Loading plan...",
          cancellable: false,
        },
        async () => fetchPlanFromActivities(item.session.name, apiKey),
      );

      await reviewPlanForSession({
        sessionId: item.session.name,
        sessionTitle: item.session.title,
        plan,
        logChannel,
        planProvider,
        onApprove: async (sessionId) => {
          await approvePlan(sessionId, context);
        },
      });
    },
  );

  context.subscriptions.push(
    setApiKeyDisposable,
    verifyApiKeyDisposable,
    listSourcesDisposable,
    createSessionDisposable,
    sessionsTreeView,
    refreshSessionsDisposable,
    showActivitiesDisposable,
    filterActivitiesCommand,
    refreshActivitiesDisposable,
    showFailureReasonDisposable,
    sendMessageDisposable,
    approvePlanDisposable,
    openSettingsDisposable,
    deleteSessionDisposable,
    clearCacheDisposable,
    openInWebAppDisposable,
    openPRInBrowserDisposable,
    checkoutToBranchDisposable,
    activitiesProviderDisposable,
    treeSelectionDisposable,
    diffProviderDisposable,
    openLatestDiffDisposable,
    openChangesetDisposable,
    planProviderDisposable,
    reviewPlanDisposable,
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  stopAutoRefresh();
}
