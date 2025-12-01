import * as vscode from "vscode";

// 自動更新用のインターバル
let autoRefreshInterval: NodeJS.Timeout | undefined;

// センシティブデータ取得中フラグ
let isFetchingSensitiveData = false;

/**
 * センシティブデータ取得中かどうかを取得
 */
export function getIsFetchingSensitiveData(): boolean {
    return isFetchingSensitiveData;
}

/**
 * センシティブデータ取得中フラグを設定
 */
export function setIsFetchingSensitiveData(value: boolean): void {
    isFetchingSensitiveData = value;
}

/**
 * 自動更新を開始する
 */
export function startAutoRefresh(
    context: vscode.ExtensionContext,
    refreshCallback: (isBackground: boolean) => Promise<void>,
    logChannel: vscode.OutputChannel
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
        refreshCallback(true); // Pass true for background refresh
    }, interval);
}

/**
 * 自動更新を停止する
 */
export function stopAutoRefresh(): void {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = undefined;
    }
}

/**
 * 自動更新をリセットする
 */
export function resetAutoRefresh(
    context: vscode.ExtensionContext,
    refreshCallback: (isBackground: boolean) => Promise<void>,
    logChannel: vscode.OutputChannel
): void {
    stopAutoRefresh();
    startAutoRefresh(context, refreshCallback, logChannel);
}
