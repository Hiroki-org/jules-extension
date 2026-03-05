import * as vscode from "vscode";
import { Activity, Artifact } from "./types";

/**
 * Activity をカテゴリ分類するための型定義
 */
export type ActivityCategory = "Plan" | "Progress" | "Artifacts" | "Messages" | "Errors";

/**
 * Activity の union key 型定義
 */
export const ACTIVITY_UNION_KEYS = [
    "agentMessaged",
    "userMessaged",
    "planGenerated",
    "planApproved",
    "progressUpdated",
    "sessionCompleted",
    "sessionFailed",
] as const;

export type ActivityUnionKey = (typeof ACTIVITY_UNION_KEYS)[number];

/**
 * Activity のアクティブなキーを取得
 * @param activity Activity オブジェクト
 * @returns アクティブなキーの配列
 */
export function getActiveActivityKeys(activity: Activity): ActivityUnionKey[] {
    const keys: ActivityUnionKey[] = [];

    if (activity.agentMessaged !== undefined && activity.agentMessaged !== null) { keys.push("agentMessaged"); }
    if (activity.userMessaged !== undefined && activity.userMessaged !== null) { keys.push("userMessaged"); }
    if (activity.planGenerated !== undefined && activity.planGenerated !== null) { keys.push("planGenerated"); }
    if (activity.planApproved !== undefined && activity.planApproved !== null) { keys.push("planApproved"); }
    if (activity.progressUpdated !== undefined && activity.progressUpdated !== null) { keys.push("progressUpdated"); }
    if (activity.sessionCompleted !== undefined && activity.sessionCompleted !== null) { keys.push("sessionCompleted"); }
    if (activity.sessionFailed !== undefined && activity.sessionFailed !== null) { keys.push("sessionFailed"); }

    return keys;
}

/**
 * Activity をカテゴリに分類する
 *
 * カテゴリマッピング：
 * - Plan: planGenerated, planApproved
 * - Progress: progressUpdated, sessionCompleted
 * - Artifacts: artifacts配列を持つActivity
 * - Messages: agentMessaged, userMessaged
 * - Errors: sessionFailed
 *
 * @param activity Activity オブジェクト
 * @returns Activity のカテゴリ
 */
export function getActivityCategory(activity: Activity): ActivityCategory {
    // Error チェック（優先度最高）
    if (activity.sessionFailed) {
        return "Errors";
    }

    // Plan チェック
    if (activity.planGenerated || activity.planApproved) {
        return "Plan";
    }

    // Progress チェック
    if (activity.progressUpdated || activity.sessionCompleted) {
        return "Progress";
    }

    // Artifacts チェック（artifacts配列を持つActivity）
    if (activity.artifacts && activity.artifacts.length > 0) {
        const hasArtifacts = activity.artifacts.some(
            (artifact) =>
                artifact.changeSet || artifact.bashOutput || artifact.media,
        );
        if (hasArtifacts) {
            return "Artifacts";
        }
    }

    // Messages チェック（デフォルト）
    if (activity.agentMessaged || activity.userMessaged) {
        return "Messages";
    }

    // デフォルト: Messages
    return "Messages";
}

/**
 * Activity の icon を取得
 * @param activity Activity オブジェクト
 * @returns icon 文字列
 */
export function getActivityIcon(activity: Activity): string {
    const keys = getActiveActivityKeys(activity);
    if (keys.length !== 1) {
        return "ℹ️";
    }
    switch (keys[0]) {
        case "planGenerated":
            return "📝";
        case "planApproved":
            return "👍";
        case "progressUpdated":
            return "🔄";
        case "sessionCompleted":
            return "✅";
        case "sessionFailed":
            return "❌";
        case "agentMessaged":
            return "💬";
        case "userMessaged":
            return "🗨️";
        default:
            return "ℹ️";
    }
}

/**
 * Activity type のラベルを取得
 * @param key ActivityUnionKey
 * @returns ラベル文字列
 */
export function getActivityTypeLabel(key: ActivityUnionKey): string {
    switch (key) {
        case "planGenerated":
            return "Plan generated";
        case "planApproved":
            return "Plan approved";
        case "agentMessaged":
            return "Agent messaged";
        case "userMessaged":
            return "User messaged";
        case "progressUpdated":
            return "Progress updated";
        case "sessionCompleted":
            return "Session completed";
        case "sessionFailed":
            return "Session failed";
        default:
            return "Activity";
    }
}

/**
 * 複数の値から最初の空でない文字列を取得
 * @param values 値の配列
 * @returns 最初の空でない文字列、またはnull
 */
export function pickFirstNonEmpty(
    ...values: Array<string | undefined | null>
): string | null {
    for (const value of values) {
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return null;
}

/**
 * テキストを指定長で切り詰める
 * @param text 対象テキスト
 * @param maxLength 最大長（デフォルト: 300）
 * @returns 切り詰めたテキスト
 */
export function truncateForDisplay(text: string, maxLength: number = 300): string {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}...`;
}

/**
 * Artifacts をサマリー化する
 * @param artifacts Artifact 配列
 * @returns サマリー文字列またはnull
 */
export function summarizeArtifacts(artifacts?: Artifact[]): string | null {
    if (!artifacts || artifacts.length === 0) {
        return null;
    }
    const types = new Set<string>();
    artifacts.forEach((artifact) => {
        if (artifact.changeSet) {
            types.add("changeSet");
        }
        if (artifact.bashOutput) {
            types.add("bashOutput");
        }
        if (artifact.media) {
            types.add("media");
        }
    });
    if (types.size === 0) {
        return null;
    }
    return `Artifacts: ${[...types].join(", ")}`;
}

/**
 * Activity のサマリーテキストを取得
 * @param activity Activity オブジェクト
 * @returns サマリーテキスト
 */
export function getActivitySummaryText(activity: Activity): string {
    const progressText = pickFirstNonEmpty(
        activity.progressUpdated?.title,
        activity.progressUpdated?.description,
    );
    if (progressText) {
        return progressText;
    }

    if (activity.sessionFailed) {
        const reason = pickFirstNonEmpty(activity.sessionFailed.reason)?.trim();
        return reason ? `Session failed: ${reason}` : "Session failed";
    }

    const activityDescription = pickFirstNonEmpty(activity.description);
    if (activityDescription) {
        return activityDescription;
    }

    const artifactsSummary = summarizeArtifacts(activity.artifacts);
    if (artifactsSummary) {
        return artifactsSummary;
    }

    const activeKeys = getActiveActivityKeys(activity);
    if (activeKeys.length === 1) {
        return getActivityTypeLabel(activeKeys[0]);
    }

    const originator = activity.originator ?? "unknown";
    const timePart = activity.createTime ? `, time=${activity.createTime}` : "";
    return `Activity (originator=${originator}${timePart})`;
}

/**
 * Activity の VSCode TreeView アイテム用のラベルプレフィックスを取得
 * 重要イベントのハイライト用：
 * - planGenerated → "Plan: " プレフィックス
 * - planApproved → "Approved: " プレフィックス
 * - sessionFailed → "FAILED: " プレフィックス
 * - sessionCompleted → "Completed: " プレフィックス
 * - artifacts に changeSet を含む → "(diff) " プレフィックス
 *
 * @param activity Activity オブジェクト
 * @returns ラベルプレフィックス文字列
 */
export function getActivityLabelPrefix(activity: Activity): string {
    if (activity.planGenerated) {
        return "Plan: ";
    }
    if (activity.planApproved) {
        return "Approved: ";
    }
    if (activity.sessionFailed) {
        return "FAILED: ";
    }
    if (activity.sessionCompleted) {
        return "Completed: ";
    }
    // artifacts に changeSet を含むかチェック
    if (
        activity.artifacts &&
        activity.artifacts.some((artifact) => artifact.changeSet)
    ) {
        return "(diff) ";
    }
    return "";
}

/**
 * Activity の重要イベントに応じた ThemeIcon を返す
 */
export function getActivityThemeIcon(activity: Activity): vscode.ThemeIcon | undefined {
    if (activity.sessionFailed) {
        return new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground"));
    }
    if (activity.planGenerated) {
        return new vscode.ThemeIcon("lightbulb");
    }
    if (activity.planApproved) {
        return new vscode.ThemeIcon("check");
    }
    if (activity.sessionCompleted) {
        return new vscode.ThemeIcon("pass");
    }
    if (activity.progressUpdated) {
        return new vscode.ThemeIcon("pulse");
    }
    if (activity.agentMessaged) {
        return new vscode.ThemeIcon("comment");
    }
    if (activity.userMessaged) {
        return new vscode.ThemeIcon("account");
    }
    if (activity.artifacts?.some((artifact) => artifact.changeSet)) {
        return new vscode.ThemeIcon("diff");
    }
    if (activity.artifacts?.some((artifact) => artifact.bashOutput)) {
        return new vscode.ThemeIcon("terminal");
    }
    return undefined;
}
