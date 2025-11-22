import * as vscode from 'vscode';
import { JulesSessionsProvider } from './sessionManager';

let autoRefreshInterval: NodeJS.Timeout | undefined;

export function startAutoRefresh(
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

export function stopAutoRefresh(): void {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = undefined;
  }
}
