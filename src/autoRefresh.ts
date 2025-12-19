import * as vscode from 'vscode';
import { JulesSessionsProvider, isFetchingSensitiveData } from './sessionViewProvider';
import { logChannel } from './logger';

let autoRefreshInterval: NodeJS.Timeout | undefined;

export function startAutoRefresh(
    context: vscode.ExtensionContext,
    sessionsProvider: JulesSessionsProvider
): void {
    const config = vscode.workspace.getConfiguration(
        "jules-extension.autoRefresh"
    );
    const isEnabled = config.get<boolean>("enabled");

    // 動的に間隔を選択
    const intervalSeconds = isFetchingSensitiveData
        ? config.get<number>("fastInterval", 30)
        : config.get<number>("interval", 60);
    const interval = intervalSeconds * 1000; // Convert seconds to milliseconds

    logChannel.appendLine(
        `Jules: Auto-refresh enabled=${isEnabled}, interval=${intervalSeconds}s (${interval}ms), fastMode=${isFetchingSensitiveData}`
    );

    if (!isEnabled) {
        return;
    }

    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    autoRefreshInterval = setInterval(() => {
        logChannel.appendLine("Jules: Auto-refresh triggered");
        sessionsProvider.refresh(true); // Pass true for background refresh
    }, interval);
}

export function stopAutoRefresh(): void {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = undefined;
    }
}

export function resetAutoRefresh(
    context: vscode.ExtensionContext,
    sessionsProvider: JulesSessionsProvider
): void {
    stopAutoRefresh();
    startAutoRefresh(context, sessionsProvider);
}
