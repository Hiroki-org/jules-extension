// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { PRStatusCache } from './types';
import { JulesSessionsProvider } from './sessionViewProvider';
import { PR_CACHE_DURATION } from './constants';
import {
  setPrStatusCache,
  loadPreviousSessionStates,
  prStatusCache
} from './sessionManager';
import { setLogChannel, logChannel } from './logger';
import { updateStatusBar } from './uiUtils';
import { registerCommands } from './commands';
import { startAutoRefresh, stopAutoRefresh } from './autoRefresh';
import { GitHubAuth } from './githubAuth';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Jules Extension is now active");

  // Create OutputChannel for Logs
  const mainLogChannel = vscode.window.createOutputChannel("Jules Extension Logs");
  setLogChannel(mainLogChannel);
  context.subscriptions.push(mainLogChannel);
  // Also push the exported logChannel dummy if we wanted to dispose it, but mainLogChannel is the real one.

  // Load PR status cache to avoid redundant GitHub API calls on startup
  const loadedCache = context.globalState.get<PRStatusCache>("jules.prStatusCache", {});
  // Clean up expired entries
  const now = Date.now();
  const expiredUrls = Object.keys(loadedCache).filter(
    (url) => now - loadedCache[url].lastChecked > PR_CACHE_DURATION
  );

  if (expiredUrls.length > 0) {
    expiredUrls.forEach((url) => delete loadedCache[url]);
    console.log(`Jules: Cleaned up ${expiredUrls.length} expired PR status cache entries.`);
  }
  setPrStatusCache(loadedCache);

  loadPreviousSessionStates(context);

  const sessionsProvider = new JulesSessionsProvider(context);
  const sessionsTreeView = vscode.window.createTreeView("julesSessionsView", {
    treeDataProvider: sessionsProvider,
    showCollapseAll: false,
  });
  console.log("Jules: TreeView created");
  context.subscriptions.push(sessionsTreeView);

  // ステータスバーアイテム作成
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "jules-extension.listSources";
  context.subscriptions.push(statusBarItem);

  // 初期表示を更新
  updateStatusBar(context, statusBarItem);

  // Set initial context for welcome views
  const selectedSource = context.globalState.get("selected-source");
  vscode.commands.executeCommand('setContext', 'jules-extension.hasSelectedSource', !!selectedSource);

  // Create OutputChannel for Activities
  const activitiesChannel =
    vscode.window.createOutputChannel("Jules Activities");
  context.subscriptions.push(activitiesChannel);

  // Register all commands
  registerCommands(context, sessionsProvider, statusBarItem, activitiesChannel);

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
}

// This method is called when your extension is deactivated
export function deactivate() {
  stopAutoRefresh();
}
