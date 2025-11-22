// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { JulesSessionsProvider } from "./sessionManager";
import * as commandHandlers from './commandHandlers';
import { updateStatusBar } from "./utils";
import { stopAutoRefresh, startAutoRefresh } from "./autoRefresh";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Jules Extension is now active");

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

  // Sign in to GitHub via VS Code authentication
  const signInDisposable = vscode.commands.registerCommand('jules-extension.signInGitHub', () => commandHandlers.signInGitHub(logChannel));
  context.subscriptions.push(signInDisposable);

  const setApiKeyDisposable = vscode.commands.registerCommand(
    "jules-extension.setApiKey",
    () => commandHandlers.setApiKey(context)
  );

  const verifyApiKeyDisposable = vscode.commands.registerCommand(
    "jules-extension.verifyApiKey",
    () => commandHandlers.verifyApiKey(context)
  );

  const listSourcesDisposable = vscode.commands.registerCommand(
    "jules-extension.listSources",
    () => commandHandlers.listSources(context, logChannel, statusBarItem, sessionsProvider)
  );

  const createSessionDisposable = vscode.commands.registerCommand(
    "jules-extension.createSession",
    () => commandHandlers.createSession(context, logChannel)
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
    () => commandHandlers.refreshSessions(sessionsProvider)
  );

  const showActivitiesDisposable = vscode.commands.registerCommand(
    "jules-extension.showActivities",
    (sessionId: string) => commandHandlers.showActivities(context, activitiesChannel, sessionId)
  );

  const refreshActivitiesDisposable = vscode.commands.registerCommand(
    "jules-extension.refreshActivities",
    () => commandHandlers.refreshActivities(context, activitiesChannel)
  );

  const sendMessageDisposable = vscode.commands.registerCommand(
    "jules-extension.sendMessage",
    (item?: any | string) => {
      commandHandlers.sendMessageToSession(context, item);
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
      await commandHandlers.approvePlan(sessionId, context);
    }
  );

  const openSettingsDisposable = vscode.commands.registerCommand(
    "jules-extension.openSettings",
    () => commandHandlers.openSettings()
  );

  const deleteSessionDisposable = vscode.commands.registerCommand(
    "jules-extension.deleteSession",
    (item?: any) => {
        commandHandlers.deleteSession(context, sessionsProvider, item);
    }
  );

  const setGithubTokenDisposable = vscode.commands.registerCommand(
    "jules-extension.setGithubToken",
    () => commandHandlers.setGithubToken(context, sessionsProvider)
  );

  const setGitHubPatDisposable = vscode.commands.registerCommand(
    "jules-extension.setGitHubPat",
    () => commandHandlers.setGitHubPat(context, logChannel)
  );

  const clearCacheDisposable = vscode.commands.registerCommand(
    "jules-extension.clearCache",
    () => commandHandlers.clearCache(context, logChannel)
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
