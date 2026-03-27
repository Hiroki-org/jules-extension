import * as vscode from "vscode";

/**
 * Builds the final prompt by prepending the custom prompt from configuration if available.
 * @param userPrompt - The raw user prompt.
 * @returns The combined prompt with custom instructions at the beginning.
 */
export function buildFinalPrompt(userPrompt: string): string {
  const config = vscode.workspace.getConfiguration("jules-extension");
  const customPrompt = config.get<string>("customPrompt", "");
  const enforceJapanese = config.get<boolean>("enforceJapanese", true);

  const basePrompt = customPrompt ? `${customPrompt}

${userPrompt}` : userPrompt;

  if (!enforceJapanese) {
    return basePrompt;
  }

  const japaneseInstruction = "Please use Japanese for all GitHub interactions (PR titles, descriptions, commit messages, and review replies).";

  return `${basePrompt}

${japaneseInstruction}`;
}
