// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { JulesApiClient } from './julesApiClient';
import { GitHubBranch, GitHubRepo, Source as SourceType, SourcesResponse } from './types';
import { getBranchesForSession } from './branchUtils';
import { parseGitHubUrl, createRemoteBranch } from "./githubUtils";
import { SourcesCache, isCacheValid } from './cache';

// Constants
const JULES_API_BASE_URL = "https://jules.googleapis.com/v1alpha";

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
}

interface SessionResponse {
  name: string;
  // Add other fields if needed
}

interface SessionOutput {
  pullRequest?: {
    url: string;
    title: string;
    description: string;
  };
}

interface Session {
  name: string;
  title: string;
  state: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  rawState: string;
  outputs?: SessionOutput[];
  sourceContext?: {
    source: string;
  };
  // Add other fields if needed
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
async function getRepoInfoForBranchCreation(
  context: vscode.ExtensionContext
): Promise<{ pat: string; owner: string; repo: string } | null> {
  const pat = await context.secrets.get("jules-github-pat");
  if (!pat) {
    vscode.window.showErrorMessage(
      "GitHub PAT is not set. Please run 'Jules: Set GitHub PAT' command first."
    );
    return null;
  }

  const gitHubUrl = await getGitHubUrl();
  if (!gitHubUrl) {
    vscode.window.showErrorMessage("Unable to determine GitHub repository URL.");
    return null;
  }

  const repoInfo = parseGitHubUrl(gitHubUrl);
  if (!repoInfo) {
    vscode.window.showErrorMessage("Invalid GitHub repository URL.");
    return null;
  }

  return { pat, ...repoInfo };
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

function checkForPlansAwaitingApproval(currentSessions: Session[]): Session[] {
  const sessionsAwaitingApproval: Session[] = [];
  for (const session of currentSessions) {
    const prevState = previousSessionStates.get(session.name);
    if (prevState?.isTerminated) {
      continue; // Skip terminated sessions
    }
    if (
      session.rawState === "AWAITING_PLAN_APPROVAL" &&
      (!prevState || prevState.rawState !== "AWAITING_PLAN_APPROVAL")
    ) {
      sessionsAwaitingApproval.push(session);
    }
  }
  return sessionsAwaitingApproval;
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

async function notifyPlanAwaitingApproval(
  session: Session,
  context: vscode.ExtensionContext
): Promise<void> {
  const selection = await vscode.window.showInformationMessage(
    `Jules has a plan ready for your approval in session: "${session.title}"`,
    "Approve Plan",
    "View Details"
  );

  if (selection === "Approve Plan") {
    await approvePlan(session.name, context);
  } else if (selection === "View Details") {
    await vscode.commands.executeCommand(
      "jules-extension.showActivities",
      session.name
    );
  }
}

async function updatePreviousStates(
  currentSessions: Session[],
  context: vscode.ExtensionContext
): Promise<void> {
  for (const session of currentSessions) {
    const prevState = previousSessionStates.get(session.name);

    // If already terminated, we don't need to check again.
    // Just update with the latest info from the server but keep it terminated.
    if (prevState?.isTerminated) {
      previousSessionStates.set(session.name, {
        ...prevState,
        state: session.state,
        rawState: session.rawState,
        outputs: session.outputs,
      });
      continue;
    }

    let isTerminated = false;
    if (session.state === "COMPLETED") {
      const prUrl = extractPRUrl(session);
      if (prUrl) {
        const isClosed = await checkPRStatus(prUrl, context);
        if (isClosed) {
          isTerminated = true;
          console.log(
            `Jules: Session ${session.name} is now terminated because its PR is closed.`
          );
        }
      }
    } else if (session.state === "FAILED" || session.state === "CANCELLED") {
      isTerminated = true;
      console.log(
        `Jules: Session ${session.name} is now terminated due to its state: ${session.state}.`
      );
    }

    previousSessionStates.set(session.name, {
      name: session.name,
      state: session.state,
      rawState: session.rawState,
      outputs: session.outputs,
      isTerminated: isTerminated,
    });
  }

  // Persist the updated states to global state
  await context.globalState.update(
    "jules.previousSessionStates",
    Object.fromEntries(previousSessionStates)
  );
  console.log(
    `Jules: Saved ${previousSessionStates.size} session states to global state.`
  );
}

function startAutoRefresh(
  context: vscode.ExtensionContext,
  sessionsProvider: JulesSessionsProvider
): void {
  const config = vscode.workspace.getConfiguration(
    "jules-extension.autoRefresh"
  );
  const isEnabled = config.get<boolean>("enabled");
  const intervalSeconds = config.get<number>("interval", 30);
  const interval = intervalSeconds * 1000; // Convert seconds to milliseconds

  console.log(
    `Jules: Auto-refresh enabled=${isEnabled}, interval=${intervalSeconds}s (${interval}ms)`
  );

  if (!isEnabled) {
    return;
  }

  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(() => {
    console.log("Jules: Auto-refresh triggered");
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

interface ComposerOptions {
  title: string;
  placeholder?: string;
  value?: string;
  showCreatePrCheckbox?: boolean;
}

interface ComposerResult {
  prompt: string;
  createPR: boolean;
}

async function showMessageComposer(
  options: ComposerOptions
): Promise<ComposerResult | undefined> {
  const panel = vscode.window.createWebviewPanel(
    "julesMessageComposer",
    options.title,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
    }
  );

  const nonce = getNonce();
  panel.webview.html = getComposerHtml(panel.webview, options, nonce);

  return new Promise((resolve) => {
    let resolved = false;

    const finalize = (value: ComposerResult | undefined) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(value);
    };

    panel.onDidDispose(() => finalize(undefined));

    panel.webview.onDidReceiveMessage((message) => {
      if (message?.type === "submit") {
        finalize({
          prompt: typeof message.value === "string" ? message.value : "",
          createPR: !!message.createPR,
        });
        panel.dispose();
      } else if (message?.type === "cancel") {
        finalize(undefined);
        panel.dispose();
      }
    });
  });
}

function getComposerHtml(
  webview: vscode.Webview,
  options: ComposerOptions,
  nonce: string
): string {
  const placeholder = escapeAttribute(options.placeholder ?? "");
  const value = escapeHtml(options.value ?? "");
  const title = escapeHtml(options.title);
  const createPrCheckbox = options.showCreatePrCheckbox
    ? `
    <div class="create-pr-container">
      <input type="checkbox" id="create-pr" checked />
      <label for="create-pr">Create PR automatically?</label>
    </div>
  `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style nonce="${nonce}">
  body {
    margin: 0;
    padding: 16px;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    box-sizing: border-box;
  }

  textarea {
    flex: 1;
    width: 100%;
    resize: vertical;
    font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size);
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 12px;
    box-sizing: border-box;
    line-height: 1.5;
  }

  textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16px;
    margin-top: 16px;
  }

  .create-pr-container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
  }

  button {
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
  }

  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  button.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
</style>
</head>
<body>
  <textarea id="message" placeholder="${placeholder}" autofocus>${value}</textarea>
  <div class="actions">
    ${createPrCheckbox}
    <button type="button" id="cancel">Cancel</button>
    <button type="button" id="submit" class="primary">Send</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const textarea = document.getElementById('message');
    const createPrCheckbox = document.getElementById('create-pr');
    const submit = () => {
      vscode.postMessage({
        type: 'submit',
        value: textarea.value,
        createPR: createPrCheckbox ? createPrCheckbox.checked : false,
      });
    };

    document.getElementById('submit').addEventListener('click', submit);
    document.getElementById('cancel').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    textarea.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        vscode.postMessage({ type: 'cancel' });
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
      console.log("Jules: Fetch already in progress. Skipping.");
      return;
    }
    this.isFetching = true;
    console.log("Jules: Starting to fetch and process sessions...");

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
        console.error(`Jules: ${errorMsg}`);
        if (!isBackground) {
          vscode.window.showErrorMessage(errorMsg);
        }
        this.sessionsCache = [];
        return;
      }

      const data = (await response.json()) as SessionsResponse;
      if (!data.sessions || !Array.isArray(data.sessions)) {
        console.log("Jules: No sessions found or invalid response format");
        this.sessionsCache = [];
        return;
      }

      console.log(`Jules: Found ${data.sessions.length} total sessions`);

      const allSessionsMapped = data.sessions.map((session) => ({
        ...session,
        rawState: session.state,
        state: mapApiStateToSessionState(session.state),
      }));

      // --- Check for plans awaiting approval ---
      const plansAwaitingApproval =
        checkForPlansAwaitingApproval(allSessionsMapped);
      if (plansAwaitingApproval.length > 0) {
        console.log(
          `Jules: Found ${plansAwaitingApproval.length} sessions awaiting plan approval`
        );
        for (const session of plansAwaitingApproval) {
          notifyPlanAwaitingApproval(session, this.context).catch((error) => {
            console.error(
              "Jules: Failed to show plan approval notification",
              error
            );
          });
        }
      }

      // --- Check for completed sessions (PR created) ---
      const completedSessions = checkForCompletedSessions(allSessionsMapped);
      if (completedSessions.length > 0) {
        console.log(
          `Jules: Found ${completedSessions.length} completed sessions`
        );
        for (const session of completedSessions) {
          const prUrl = extractPRUrl(session);
          if (prUrl) {
            notifyPRCreated(session, prUrl).catch((error) => {
              console.error("Jules: Failed to show PR notification", error);
            });
          }
        }
      }

      // --- Update previous states after all checks ---
      await updatePreviousStates(allSessionsMapped, this.context);

      // --- Update the cache ---
      this.sessionsCache = allSessionsMapped;
    } catch (error) {
      console.error("Jules: Error during fetchAndProcessSessions:", error);
      this.sessionsCache = []; // Clear cache on error
    } finally {
      this.isFetching = false;
      console.log("Jules: Finished fetching and processing sessions.");
      // Fire the event to refresh the view with the new data
      this._onDidChangeTreeData.fire();
    }
  }

  async refresh(isBackground: boolean = false): Promise<void> {
    console.log(
      `Jules: refresh() called (isBackground: ${isBackground}), starting fetch.`
    );
    await this.fetchAndProcessSessions(isBackground);
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
    this.tooltip = `${session.name} - ${session.state}`;
    this.description = session.state;
    this.iconPath = this.getIcon(session.state);
    this.contextValue = "jules-session";
    this.command = {
      command: "jules-extension.showActivities",
      title: "Show Activities",
      arguments: [session.name],
    };
  }

  private getIcon(state: string): vscode.ThemeIcon {
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
  const logChannel = vscode.window.createOutputChannel("Jules Extension Logs");
  context.subscriptions.push(logChannel);

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

      try {
        // ブランチ選択ロジック（メッセージ入力前に移動）
        const { branches, defaultBranch: selectedDefaultBranch, currentBranch, remoteBranches } = await getBranchesForSession(selectedSource, apiClient, logChannel, context);

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
        if (!new Set(remoteBranches).has(startingBranch)) {
          // ローカル専用ブランチの場合
          logChannel.appendLine(`[Jules] Warning: Branch "${startingBranch}" not found on remote`);

          const action = await vscode.window.showWarningMessage(
            `Branch "${startingBranch}" exists locally but has not been pushed to remote.\n\nJules requires a remote branch to start a session.`,
            { modal: true },
            'Create Remote Branch',
            'Use Default Branch',
            'Cancel'
          );

          if (action === 'Create Remote Branch') {
            const creationInfo = await getRepoInfoForBranchCreation(context);
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
                    creationInfo.pat,
                    creationInfo.owner,
                    creationInfo.repo,
                    startingBranch
                  );
                  progress.report({ increment: 100, message: "Remote branch created!" });
                }
              );
              logChannel.appendLine(`[Jules] Remote branch "${startingBranch}" created successfully`);
              vscode.window.showInformationMessage(`Remote branch "${startingBranch}" created successfully.`);

              // Force refresh branches cache after remote branch creation
              try {
                await getBranchesForSession(selectedSource, apiClient, logChannel, context, true);
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
        `本当にセッション "${session.title}" をローカルキャッシュから削除しますか？\n\n注意: これは表示上の削除のみで、Julesサーバー上のセッションは削除されません。`,
        { modal: true },
        "削除する"
      );

      if (confirm !== "削除する") {
        return;
      }

      // Remove from previous states to hide it
      previousSessionStates.delete(session.name);
      await context.globalState.update(
        "jules.previousSessionStates",
        Object.fromEntries(previousSessionStates)
      );

      vscode.window.showInformationMessage(
        `セッション "${session.title}" をローカルキャッシュから削除しました。`
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
            "GitHub Personal Access Token を入力してください（PRのステータスチェック用）",
          password: true,
          placeHolder: "ghp_xxxxxxxxxxxxxxxxxxxx",
          ignoreFocusOut: true,
        });

        if (token === undefined) {
          // User cancelled the input
          console.log("Jules: GitHub Token input cancelled by user");
          return;
        }

        if (token === "") {
          vscode.window.showWarningMessage(
            "GitHub Token を入力してください。キャンセルしました。"
          );
          return;
        }

        // Validate token format
        if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
          const proceed = await vscode.window.showWarningMessage(
            "入力したトークンが GitHub のトークン形式ではないようです。本当に保存しますか？",
            { modal: true },
            "保存する",
            "キャンセル"
          );
          if (proceed !== "保存する") {
            return;
          }
        }

        await context.secrets.store("jules-github-token", token);
        vscode.window.showInformationMessage(
          "GitHub Token を安全に保存しました。"
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
      const pat = await vscode.window.showInputBox({
        prompt: 'Enter your GitHub Personal Access Token (with "repo" scope)',
        password: true,
        placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'PAT cannot be empty';
          }

          // 厳格なフォーマットチェック
          const ghpPattern = /^ghp_[A-Za-z0-9]{36}$/;
          const githubPatPattern = /^github_pat_[A-Za-z0-9_]{82}$/;

          if (!ghpPattern.test(value) && !githubPatPattern.test(value)) {
            return 'Invalid PAT format. Expected formats:\n' +
              '- Classic: ghp_ followed by 36 characters\n' +
              '- Fine-grained: github_pat_ followed by 82 characters';
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
          vscode.window.showInformationMessage('GitHub PAT saved successfully');
          logChannel.appendLine('[Jules] GitHub PAT saved');
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

