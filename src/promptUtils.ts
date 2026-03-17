import * as vscode from "vscode";

/**
 * Builds the final prompt by prepending the custom prompt from configuration if available.
 * @param userPrompt - The raw user prompt.
 * @returns The combined prompt with custom instructions at the beginning.
 */
export function buildFinalPrompt(userPrompt: string): string {
  const customPrompt = vscode.workspace
    .getConfiguration("jules-extension")
    .get<string>("customPrompt", "");
  return customPrompt ? `${userPrompt}\n\n${customPrompt}` : userPrompt;
}
