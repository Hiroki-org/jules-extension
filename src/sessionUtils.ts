import * as vscode from "vscode";
import { fetchWithTimeout } from "./fetchUtils";
import { buildFinalPrompt } from "./promptUtils";
import { Activity, SourceType } from "./types";
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
  sessionId: string,
  activityId: string,
): Promise<Activity> {
  const client = new JulesApiClient(apiKey, JULES_API_BASE_URL);

  try {
    return await client.getActivity(sessionId, activityId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch activity: ${message}`);
  }
}
