// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import {
    loadPreviousSessionStates,
} from './sessionManager';
import { JulesSessionsProvider } from './sessionViewProvider';
import { updateStatusBar } from './uiUtils';
import { registerCommands } from './commands';

export const extensionState = {
    autoRefreshInterval: undefined as NodeJS.Timeout | undefined,
    isFetchingSensitiveData: false,
};

// Helper functions

export async function getStoredApiKey(
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

export function buildFinalPrompt(userPrompt: string): string {
  const customPrompt = vscode.workspace
    .getConfiguration("jules-extension")
    .get<string>("customPrompt", "");
  return customPrompt ? `${userPrompt}\n\n${customPrompt}` : userPrompt;
}

export function startAutoRefresh(
  context: vscode.ExtensionContext,
  sessionsProvider: JulesSessionsProvider
): void {
  const config = vscode.workspace.getConfiguration(
    "jules-extension.autoRefresh"
  );
  const isEnabled = config.get<boolean>("enabled");

  // 動的に間隔を選択
  const intervalSeconds = extensionState.isFetchingSensitiveData
    ? config.get<number>("fastInterval", 30)
    : config.get<number>("interval", 60);
  const interval = intervalSeconds * 1000; // Convert seconds to milliseconds

  console.log(
    `Jules: Auto-refresh enabled=${isEnabled}, interval=${intervalSeconds}s (${interval}ms), fastMode=${extensionState.isFetchingSensitiveData}`
  );

  if (!isEnabled) {
    return;
  }

  if (extensionState.autoRefreshInterval) {
    clearInterval(extensionState.autoRefreshInterval);
  }

  extensionState.autoRefreshInterval = setInterval(() => {
    console.log("Jules: Auto-refresh triggered");
    sessionsProvider.refresh(true); // Pass true for background refresh
  }, interval);
}

export function stopAutoRefresh(): void {
  if (extensionState.autoRefreshInterval) {
    clearInterval(extensionState.autoRefreshInterval);
    extensionState.autoRefreshInterval = undefined;
  }
}

export function resetAutoRefresh(
  context: vscode.ExtensionContext,
  sessionsProvider: JulesSessionsProvider
): void {
  stopAutoRefresh();
  startAutoRefresh(context, sessionsProvider);
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

  registerCommands(context, sessionsProvider, statusBarItem, activitiesChannel, logChannel);

  // Perform initial refresh to populate the tree view (async, don't wait)
  console.log("Jules: Starting initial refresh...");
  sessionsProvider.refresh();

  startAutoRefresh(context, sessionsProvider);
}

// This method is called when your extension is deactivated
export function deactivate() {
  stopAutoRefresh();
}

