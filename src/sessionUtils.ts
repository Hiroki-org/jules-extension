import * as vscode from "vscode";
import { fetchWithTimeout } from "./fetchUtils";
import { buildFinalPrompt } from "./promptUtils";
import { SourceType } from "./types";
import { JULES_API_BASE_URL, ALL_SOURCES_ID } from "./julesApiConstants";

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

export interface SessionResponse {
  name: string;
}

export async function createJulesSession(
  context: vscode.ExtensionContext,
  selectedSource: SourceType,
  apiKey: string,
  startingBranch: string,
  prompt: string,
  title: string,
  automationMode: "AUTO_CREATE_PR" | "MANUAL",
  requirePlanApproval?: boolean
): Promise<string> {
  const finalPrompt = buildFinalPrompt(prompt);

  if (selectedSource.id === ALL_SOURCES_ID) {
    throw new Error("Please select a specific repository source first.");
  }

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
    requirePlanApproval,
  };

  return await vscode.window.withProgress(
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
      if (!session || typeof session.name !== "string" || !session.name.trim()) {
        throw new Error("Invalid response: session name is missing.");
      }
      await context.globalState.update("active-session-id", session.name);
      await vscode.commands.executeCommand("jules-extension.refreshActivities");
      progress.report({
        increment: 100,
        message: "Session created!",
      });
      vscode.window.showInformationMessage(
        `Session created: ${session.name}`,
      );
      return session.name;
    },
  );
}
