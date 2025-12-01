import * as vscode from "vscode";
import { Source as SourceType, Activity } from './types';
import { SessionTreeItem } from './SessionTreeItem';

/**
 * 保存されたAPIキーを取得する
 */
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

/**
 * カスタムプロンプトを付与した最終プロンプトを構築する
 */
export function buildFinalPrompt(userPrompt: string): string {
    const customPrompt = vscode.workspace
        .getConfiguration("jules-extension")
        .get<string>("customPrompt", "");
    return customPrompt ? `${userPrompt}\n\n${customPrompt}` : userPrompt;
}

/**
 * セッションIDを解決する
 */
export function resolveSessionId(
    context: vscode.ExtensionContext,
    target?: SessionTreeItem | string
): string | undefined {
    return (
        (typeof target === "string" ? target : undefined) ??
        (target instanceof SessionTreeItem ? target.session.name : undefined) ??
        context.globalState.get<string>("active-session-id")
    );
}

/**
 * ステータスバーを更新する
 */
export function updateStatusBar(
    context: vscode.ExtensionContext,
    statusBarItem: vscode.StatusBarItem
): void {
    const selectedSource = context.globalState.get<SourceType>("selected-source");

    if (selectedSource) {
        // GitHubリポジトリ名を抽出（例: "sources/github/owner/repo" -> "owner/repo"）
        const repoMatch = selectedSource.name?.match(/sources\/github\/(.+)/);
        const repoName = repoMatch ? repoMatch[1] : selectedSource.name;

        statusBarItem.text = `$(repo) Jules: ${repoName}`;
        statusBarItem.tooltip = `Current Source: ${repoName}\nClick to change source`;
        statusBarItem.show();
    } else {
        statusBarItem.text = `$(repo) Jules: No source selected`;
        statusBarItem.tooltip = "Click to select a source";
        statusBarItem.show();
    }
}

/**
 * アクティビティのアイコンを取得する
 */
export function getActivityIcon(activity: Activity): string {
    if (activity.planGenerated) {
        return "📝";
    }
    if (activity.planApproved) {
        return "👍";
    }
    if (activity.progressUpdated) {
        return "🔄";
    }
    if (activity.sessionCompleted) {
        return "✅";
    }
    return "ℹ️";
}
