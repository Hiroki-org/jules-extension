import type { Session } from "./types";
import { isActivityCorrupted } from "./activityUtils";
import * as vscode from "vscode";
import { fetchWithTimeout } from "./fetchUtils";
import { buildFinalPrompt } from "./promptUtils";
import { Activity, SourceType, ActivitiesResponse } from "./types";
import { JULES_API_BASE_URL } from "./julesApiConstants";
import { JulesApiClient } from "./julesApiClient";

export interface CreateSessionRequest {
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

/**
 * Common logic to create a Jules session.
 * 
 * @param context - Extension context.
 * @param selectedSource - The source repository.
 * @param apiKey - Jules API Key.
 * @param startingBranch - The branch to start from.
 * @param prompt - The user's prompt.
 * @param title - Optional session title.
 * @param automationMode - AUTO_CREATE_PR or MANUAL.
 * @param requirePlanApproval - Whether to wait for plan approval.
 * @returns The created session name.
 */
export async function createJulesSession(
  context: vscode.ExtensionContext,
  selectedSource: SourceType,
  apiKey: string,
  startingBranch: string,
  prompt: string,
  title: string,
  automationMode: "AUTO_CREATE_PR" | "MANUAL",
  requirePlanApproval: boolean = false,
): Promise<string> {
  if (!selectedSource.name) {
    throw new Error("Selected source is missing resource name required by Jules API.");
  }

  const finalPrompt = buildFinalPrompt(prompt);

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Creating Jules session...",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "Sending request..." });
      const payload: CreateSessionRequest = {
        prompt: finalPrompt,
        sourceContext: {
          source: selectedSource.name,
          githubRepoContext: {
            startingBranch: startingBranch,
          },
        },
        automationMode,
        title,
        requirePlanApproval,
      };

      const url = `${JULES_API_BASE_URL}/sessions`;
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      progress.report({ increment: 50, message: "Processing response..." });

      if (!response.ok) {
        const errorText = await response.text();
        const message = errorText || `${response.status} ${response.statusText}`;
        throw new Error(`API Error: ${message}`);
      }

      const session = (await response.json()) as { name: string };
      if (!session.name) {
        throw new Error("Invalid response: session name is missing.");
      }

      progress.report({ increment: 40, message: "Updating UI..." });

      // Update active session and refresh UI
      await context.globalState.update("active-session-id", session.name);
      
      // Trigger refresh of activities to show the new session immediately
      await vscode.commands.executeCommand("jules-extension.refreshActivities");

      progress.report({
        increment: 10,
        message: "Session created!",
      });
      
      vscode.window.showInformationMessage(
        `Session created: ${session.name}`,
      );
      
      return session.name;
    },
  );
}

/**
 * Sends a message to an existing session.
 * @param apiKey - Jules API Key.
 * @param sessionName - Full session resource name.
 * @param prompt - The user's message.
 */
export async function sendMessage(
  apiKey: string,
  sessionName: string,
  prompt: string,
): Promise<void> {
  const finalPrompt = buildFinalPrompt(prompt);
  const url = `${JULES_API_BASE_URL}/${sessionName}:sendMessage`;

  const response = await fetchWithTimeout(
    url,
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
    const message = errorText || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
}

/**
 * Fetch a single activity detail by activity ID.
 */
export async function fetchSingleActivity(
  apiKey: string,
  sessionName: string,
  activityId: string,
): Promise<Activity> {
  const client = new JulesApiClient(apiKey, JULES_API_BASE_URL);

  try {
    return await client.getActivity(sessionName, activityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch activity: ${message}`, { cause: error });
  }
}

/**
 * 破損したアクティビティをページネーション対応の一括フェッチで復旧します。
 */
export async function recoverCorruptedActivities(
  apiKey: string,
  sessionName: string,
  activities: Activity[],
  progress?: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<void> {
  const corruptedActivities = activities.filter(isActivityCorrupted);
  if (corruptedActivities.length === 0) {
    return;
  }

  if (progress) {
    progress.report({
      message: `Recovering ${corruptedActivities.length} corrupted activities...`,
    });
  }

  // Optimize N+1 fetch by fetching activities in bulk via the paginated endpoint.
  // We process directly into a Map and shrink the search Set to avoid intermediate arrays.
  // ⚡ Bolt: パフォーマンス最適化。new Set(array.map(...)) による中間配列の生成を避け、
  // GC（ガベージコレクション）のプレッシャーを低減するために for...of と add() を使用。
  const corruptedIds = new Set<string>();
  for (const a of corruptedActivities) {
    corruptedIds.add(a.id);
  }
  const recoveredMap = new Map<string, Activity>();
  let pageToken: string | undefined;
  const MAX_PAGES = 10;
  let page = 0;

  try {
    const client = new JulesApiClient(apiKey, JULES_API_BASE_URL);
    do {
      page += 1;
      if (page > MAX_PAGES) {
        console.error(`Jules: Reached MAX_PAGES (${MAX_PAGES}) while recovering activities.`);
        break; // Prevent infinite loop
      }

      const data = await client.listActivities(sessionName, 1000, pageToken);

      if (data.activities) {
        for (const act of data.activities) {
          if (corruptedIds.has(act.id)) {
            if (!isActivityCorrupted(act)) {
              recoveredMap.set(act.id, act);
            }
            corruptedIds.delete(act.id);
          }
        }
      }

      // Early exit if all missing activities have been encountered in the paginated response
      if (corruptedIds.size === 0) {
        break;
      }

      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (error) {
    console.error(`Jules: Failed to recover corrupted activities in bulk: ${error}`);
  }

  // Iterate backwards to safely remove items from the array
  for (let i = activities.length - 1; i >= 0; i--) {
    const act = activities[i];
    if (isActivityCorrupted(act)) {
      const recovered = recoveredMap.get(act.id);
      if (recovered) {
        activities[i] = recovered;
      } else {
        // Drop the corrupted activity if recovery failed,
        // preventing it from overwriting healthy cache entries later.
        activities.splice(i, 1);
      }
    }
  }
}


/**
 * Handles the logic when a session requires user feedback.
 * If auto-reply is configured, it automatically sends the message.
 * Otherwise, it shows an information prompt.
 */
export async function handleUserFeedbackRequired(
  session: Session,
  apiKey: string,
  logChannel: vscode.OutputChannel,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("jules-extension");
  const autoReplyMessage = config.get<string>("autoReplyMessage", "");

  if (autoReplyMessage && autoReplyMessage.trim().length > 0) {
    try {
      logChannel.appendLine(`Jules: Auto-replying to session "${session.title}" with message: "${autoReplyMessage}"`);
      await sendMessage(apiKey, session.name, autoReplyMessage);
      return;
    } catch (err) {
      logChannel.appendLine(`Jules: Failed to auto-reply to session "${session.title}": ${err}`);
      // Fallback to manual prompt on error
    }
  }

  const selection = await vscode.window.showInformationMessage(
    `Jules is waiting for your feedback in session: "${session.title}"`,
    "View Details"
  );

  if (selection === "View Details") {
    await vscode.commands.executeCommand(SHOW_ACTIVITIES_COMMAND, session.name);
  }
}

const VIEW_DETAILS_ACTION = "View Details";
const SHOW_ACTIVITIES_COMMAND = "jules-extension.showActivities";
