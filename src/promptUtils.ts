import * as vscode from "vscode";

export function buildFinalPrompt(userPrompt: string): string {
  const customPrompt = vscode.workspace
    .getConfiguration("jules-extension")
    .get<string>("customPrompt", "");
  return customPrompt ? `${customPrompt}\n\n${userPrompt}` : userPrompt;
}
