import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Activity, Artifact, MediaArtifact, ChangeSetArtifact, BashOutputArtifact } from './types';

/**
 * Type guards for Artifacts
 */
function isMediaArtifact(artifact: Artifact): artifact is MediaArtifact {
    return artifact.type === 'media' && 'mimeType' in artifact && 'data' in artifact;
}

function isChangeSetArtifact(artifact: Artifact): artifact is ChangeSetArtifact {
    return artifact.type === 'changeSet' && 'unidiffPatch' in artifact;
}

function isBashOutputArtifact(artifact: Artifact): artifact is BashOutputArtifact {
    return artifact.type === 'bashOutput' && 'command' in artifact && 'output' in artifact;
}

/**
 * Activities WebView - セッションのアクティビティ一覧を表示
 */
export class ActivitiesWebView {
    private static currentPanel: vscode.WebviewPanel | undefined;
    private static currentActivities: Activity[] = [];
    private static extensionUri: vscode.Uri;
    private static sessionId: string = '';

    /**
     * ActivitiesをWebViewで表示
     */
    public static show(
        extensionUri: vscode.Uri,
        sessionId: string,
        sessionTitle: string,
        activities: Activity[]
    ): void {
        ActivitiesWebView.extensionUri = extensionUri;
        ActivitiesWebView.currentActivities = activities;
        ActivitiesWebView.sessionId = sessionId;

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 既存のパネルがあれば再利用
        if (ActivitiesWebView.currentPanel) {
            ActivitiesWebView.currentPanel.reveal(column);
            ActivitiesWebView.currentPanel.title = `Activities: ${sessionTitle}`;
            ActivitiesWebView.currentPanel.webview.html = ActivitiesWebView.getWebviewContent(
                ActivitiesWebView.currentPanel.webview,
                sessionId,
                sessionTitle,
                activities
            );
            return;
        }

        // 新しいパネルを作成
        const panel = vscode.window.createWebviewPanel(
            'julesActivitiesView',
            `Activities: ${sessionTitle}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ActivitiesWebView.currentPanel = panel;
        panel.webview.html = ActivitiesWebView.getWebviewContent(panel.webview, sessionId, sessionTitle, activities);

        // メッセージハンドラー
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'showArtifacts':
                        const activityIndex = message.activityIndex;
                        if (activityIndex >= 0 && activityIndex < ActivitiesWebView.currentActivities.length) {
                            const activity = ActivitiesWebView.currentActivities[activityIndex];
                            // ArtifactsViewerを開く
                            vscode.commands.executeCommand(
                                'jules-extension.showArtifacts',
                                activity
                            );
                        }
                        return;
                    case 'copyToClipboard':
                        vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('クリップボードにコピーしました');
                        return;
                }
            },
            undefined
        );

        // パネルが閉じられたときのクリーンアップ
        panel.onDidDispose(() => {
            ActivitiesWebView.currentPanel = undefined;
        });
    }

    /**
     * WebViewのHTMLコンテンツを生成
     */
    private static getWebviewContent(
        webview: vscode.Webview,
        sessionId: string,
        sessionTitle: string,
        activities: Activity[]
    ): string {
        const nonce = getNonce();

        const activitiesHtml = activities.length === 0
            ? '<p class="no-activities">このセッションにはまだアクティビティがありません</p>'
            : activities.map((activity, index) => renderActivity(activity, index)).join('');

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jules Activities</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
            line-height: 1.6;
            margin: 0;
        }

        .header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        h1 {
            font-size: 1.4em;
            margin: 0 0 8px 0;
            color: var(--vscode-titleBar-activeForeground);
        }

        .session-info {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }

        .activities-count {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
        }

        .timeline {
            position: relative;
            padding-left: 24px;
        }

        .timeline::before {
            content: '';
            position: absolute;
            left: 8px;
            top: 0;
            bottom: 0;
            width: 2px;
            background-color: var(--vscode-panel-border);
        }

        .activity {
            position: relative;
            margin-bottom: 16px;
            padding: 12px 16px;
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
        }

        .activity::before {
            content: '';
            position: absolute;
            left: -20px;
            top: 16px;
            width: 12px;
            height: 12px;
            background-color: var(--vscode-editor-background);
            border: 2px solid var(--vscode-button-background);
            border-radius: 50%;
        }

        .activity.has-artifacts::before {
            background-color: var(--vscode-button-background);
        }

        .activity-header {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 8px;
        }

        .activity-icon {
            font-size: 1.4em;
            line-height: 1;
        }

        .activity-title {
            font-weight: 600;
            flex: 1;
        }

        .activity-meta {
            display: flex;
            gap: 12px;
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
        }

        .activity-time {
            white-space: nowrap;
        }

        .activity-originator {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .activity-description {
            margin: 8px 0;
            color: var(--vscode-foreground);
        }

        .artifacts-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .artifacts-badge:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .artifacts-section {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .artifacts-preview {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }

        .artifact-chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background-color: var(--vscode-textBlockQuote-background);
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            cursor: pointer;
            border: 1px solid transparent;
            transition: border-color 0.2s;
        }

        .artifact-chip:hover {
            border-color: var(--vscode-button-background);
        }

        .artifact-chip.media {
            border-left: 3px solid #4caf50;
        }

        .artifact-chip.changeset {
            border-left: 3px solid #2196f3;
        }

        .artifact-chip.bash {
            border-left: 3px solid #ff9800;
        }

        .view-artifacts-button {
            margin-top: 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .view-artifacts-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .no-activities {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            text-align: center;
            padding: 48px;
        }

        .plan-steps {
            margin-top: 8px;
            padding: 8px 12px;
            background-color: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
        }

        .plan-steps ul {
            margin: 0;
            padding-left: 20px;
        }

        .plan-steps li {
            margin: 4px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 セッション Activities</h1>
        <div class="session-info">${escapeHtml(sessionTitle)}</div>
    </div>
    <div class="activities-count">${activities.length} 件のアクティビティ</div>
    <div class="timeline">
        ${activitiesHtml}
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        function showArtifacts(activityIndex) {
            vscode.postMessage({
                command: 'showArtifacts',
                activityIndex: activityIndex
            });
        }

        function copyToClipboard(text) {
            vscode.postMessage({
                command: 'copyToClipboard',
                text: text
            });
        }
    </script>
</body>
</html>`;
    }
}

/**
 * Activityをレンダリング
 */
function renderActivity(activity: Activity, index: number): string {
    const icon = getActivityIcon(activity);
    const timestamp = new Date(activity.createTime).toLocaleString();
    const hasArtifacts = activity.artifacts && activity.artifacts.length > 0;
    const artifactCount = activity.artifacts?.length || 0;
    
    let title = 'Activity';
    let description = '';
    let extraContent = '';

    if (activity.planGenerated) {
        title = `プラン生成: ${activity.planGenerated.plan?.title || 'プラン'}`;
        if (activity.planGenerated.plan?.steps && activity.planGenerated.plan.steps.length > 0) {
            extraContent = `
            <div class="plan-steps">
                <ul>
                    ${activity.planGenerated.plan.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
                </ul>
            </div>`;
        }
    } else if (activity.planApproved) {
        title = 'プラン承認';
        description = `Plan ID: ${activity.planApproved.planId}`;
    } else if (activity.progressUpdated) {
        title = activity.progressUpdated.title;
        description = activity.progressUpdated.description || '';
    } else if (activity.sessionCompleted) {
        title = 'セッション完了';
    }

    const artifactsHtml = hasArtifacts ? renderArtifactsSection(activity.artifacts!, index) : '';

    return `
    <div class="activity ${hasArtifacts ? 'has-artifacts' : ''}">
        <div class="activity-header">
            <span class="activity-icon">${icon}</span>
            <span class="activity-title">${escapeHtml(title)}</span>
            ${hasArtifacts ? `<span class="artifacts-badge" onclick="showArtifacts(${index})">📎 ${artifactCount}</span>` : ''}
        </div>
        <div class="activity-meta">
            <span class="activity-time">🕐 ${escapeHtml(timestamp)}</span>
            <span class="activity-originator">👤 ${escapeHtml(activity.originator)}</span>
        </div>
        ${description ? `<div class="activity-description">${escapeHtml(description)}</div>` : ''}
        ${extraContent}
        ${artifactsHtml}
    </div>`;
}

/**
 * Artifacts セクションをレンダリング
 */
function renderArtifactsSection(artifacts: Artifact[], activityIndex: number): string {
    const preview = artifacts.map(artifact => {
        let icon = '📎';
        let label = 'Artifact';
        let chipClass = '';
        
        if (isMediaArtifact(artifact)) {
            icon = '🖼️';
            label = artifact.filename || 'スクリーンショット';
            chipClass = 'media';
        } else if (isChangeSetArtifact(artifact)) {
            icon = '📝';
            label = 'コード変更';
            chipClass = 'changeset';
        } else if (isBashOutputArtifact(artifact)) {
            icon = '💻';
            label = artifact.command.length > 30 
                ? artifact.command.substring(0, 30) + '...' 
                : artifact.command;
            chipClass = 'bash';
        }
        
        return `<span class="artifact-chip ${chipClass}">${icon} ${escapeHtml(label)}</span>`;
    }).join('');

    return `
    <div class="artifacts-section">
        <div class="artifacts-preview">
            ${preview}
        </div>
        <button class="view-artifacts-button" onclick="showArtifacts(${activityIndex})">
            📂 Artifactsを詳細表示
        </button>
    </div>`;
}

/**
 * Activity用のアイコンを取得
 */
function getActivityIcon(activity: Activity): string {
    if (activity.planGenerated) {
        return '📝';
    }
    if (activity.planApproved) {
        return '👍';
    }
    if (activity.progressUpdated) {
        return '🔄';
    }
    if (activity.sessionCompleted) {
        return '✅';
    }
    if (activity.artifacts && activity.artifacts.length > 0) {
        return '📎';
    }
    return 'ℹ️';
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Nonce生成
 */
function getNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}
