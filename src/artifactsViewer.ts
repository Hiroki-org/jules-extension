import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Activity, Artifact, MediaArtifact, ChangeSetArtifact, BashOutputArtifact, BaseArtifact } from './types';

/**
 * Artifacts Viewer - WebViewパネルでArtifactsを表示
 */
export class ArtifactsViewer {
    private static currentPanel: vscode.WebviewPanel | undefined;

    /**
     * Artifactsを持つActivityを表示するWebViewを開く
     * @param extensionUri - エクステンションのルートURI（将来的なローカルアセット読み込み用に保持）
     * @param activity - 表示するActivity
     */
    public static show(
        extensionUri: vscode.Uri,
        activity: Activity
    ): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 既存のパネルがあれば再利用
        if (ArtifactsViewer.currentPanel) {
            ArtifactsViewer.currentPanel.reveal(column);
            ArtifactsViewer.currentPanel.webview.html = ArtifactsViewer.getWebviewContent(
                ArtifactsViewer.currentPanel.webview,
                extensionUri,
                activity
            );
            return;
        }

        // 新しいパネルを作成
        const panel = vscode.window.createWebviewPanel(
            'julesArtifactsViewer',
            `Artifacts: ${activity.progressUpdated?.title || 'Activity'}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ArtifactsViewer.currentPanel = panel;
        panel.webview.html = ArtifactsViewer.getWebviewContent(panel.webview, extensionUri, activity);

        // メッセージハンドラー
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
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
            ArtifactsViewer.currentPanel = undefined;
        });
    }

    /**
     * WebViewのHTMLコンテンツを生成
     */
    private static getWebviewContent(
        webview: vscode.Webview,
        extensionUri: vscode.Uri,
        activity: Activity
    ): string {
        const nonce = getNonce();

        const artifacts = activity.artifacts || [];
        const timestamp = new Date(activity.createTime).toLocaleString();
        const title = activity.progressUpdated?.title || 'Activity';

        let artifactsHtml = '';
        
        if (artifacts.length === 0) {
            artifactsHtml = '<p class="no-artifacts">このActivityにはArtifactsがありません</p>';
        } else {
            artifactsHtml = artifacts.map((artifact, index) => 
                renderArtifact(artifact, index)
            ).join('');
        }

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artifacts Viewer</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
            line-height: 1.6;
        }

        h1 {
            font-size: 1.5em;
            margin-bottom: 8px;
            color: var(--vscode-titleBar-activeForeground);
        }

        .timestamp {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 24px;
        }

        .artifact {
            margin-bottom: 24px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            overflow: hidden;
        }

        .artifact-header {
            background-color: var(--vscode-sideBar-background);
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .artifact-icon {
            font-size: 1.2em;
        }

        .artifact-title {
            font-weight: 600;
        }

        .artifact-content {
            padding: 16px;
        }

        /* Media Artifact */
        .media-image {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            cursor: pointer;
        }

        .media-description {
            margin-top: 8px;
            font-style: italic;
            color: var(--vscode-descriptionForeground);
        }

        /* ChangeSet Artifact */
        .changeset-info {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 16px;
        }

        .changeset-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .changeset-label {
            font-weight: 600;
            min-width: 150px;
        }

        .changeset-value {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textBlockQuote-background);
            padding: 4px 8px;
            border-radius: 4px;
        }

        .copy-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
        }

        .copy-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .diff-container {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: auto;
            max-height: 500px;
        }

        .diff-content {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            white-space: pre;
            margin: 0;
            padding: 12px;
        }

        .diff-line-add {
            background-color: rgba(35, 134, 54, 0.2);
            color: var(--vscode-gitDecoration-addedResourceForeground, #3fb950);
        }

        .diff-line-remove {
            background-color: rgba(248, 81, 73, 0.2);
            color: var(--vscode-gitDecoration-deletedResourceForeground, #f85149);
        }

        .diff-line-header {
            color: var(--vscode-gitDecoration-modifiedResourceForeground, #d29922);
            font-weight: bold;
        }

        .diff-line-file {
            color: var(--vscode-textLink-foreground);
            font-weight: bold;
        }

        /* BashOutput Artifact */
        .bash-command {
            background-color: var(--vscode-terminal-background, #1e1e1e);
            color: var(--vscode-terminal-foreground, #d4d4d4);
            padding: 12px;
            border-radius: 4px 4px 0 0;
            font-family: var(--vscode-editor-font-family);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .bash-prompt {
            color: var(--vscode-terminal-ansiGreen, #4ec9b0);
        }

        .bash-output {
            background-color: var(--vscode-terminal-background, #1e1e1e);
            color: var(--vscode-terminal-foreground, #d4d4d4);
            padding: 12px;
            font-family: var(--vscode-editor-font-family);
            white-space: pre-wrap;
            word-wrap: break-word;
            max-height: 400px;
            overflow: auto;
        }

        .bash-exit-code {
            padding: 8px 12px;
            font-size: 0.9em;
            border-radius: 0 0 4px 4px;
        }

        .bash-exit-success {
            background-color: rgba(35, 134, 54, 0.3);
            color: var(--vscode-terminal-ansiGreen, #4ec9b0);
        }

        .bash-exit-error {
            background-color: rgba(248, 81, 73, 0.3);
            color: var(--vscode-terminal-ansiRed, #f14c4c);
        }

        .no-artifacts {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            text-align: center;
            padding: 24px;
        }

        .artifact-count {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    <div class="timestamp">📅 ${escapeHtml(timestamp)} | 👤 ${escapeHtml(activity.originator)}</div>
    <div class="artifact-count">${artifacts.length} 件のArtifacts</div>
    <div class="artifacts-container">
        ${artifactsHtml}
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        function copyToClipboard(text) {
            vscode.postMessage({
                command: 'copyToClipboard',
                text: text
            });
        }

        // 画像クリックで拡大表示
        document.querySelectorAll('.media-image').forEach(img => {
            img.addEventListener('click', () => {
                if (img.style.maxWidth === '100%' || !img.style.maxWidth) {
                    img.style.maxWidth = 'none';
                    img.style.cursor = 'zoom-out';
                } else {
                    img.style.maxWidth = '100%';
                    img.style.cursor = 'zoom-in';
                }
            });
        });
    </script>
</body>
</html>`;
    }
}

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
 * Artifactをレンダリング
 */
function renderArtifact(artifact: Artifact, index: number): string {
    if (isMediaArtifact(artifact)) {
        return renderMediaArtifact(artifact, index);
    }
    if (isChangeSetArtifact(artifact)) {
        return renderChangeSetArtifact(artifact, index);
    }
    if (isBashOutputArtifact(artifact)) {
        return renderBashOutputArtifact(artifact, index);
    }
    return renderUnknownArtifact(artifact as BaseArtifact, index);
}

/**
 * Media Artifactをレンダリング
 */
function renderMediaArtifact(artifact: MediaArtifact, index: number): string {
    const filename = artifact.filename || `image-${index + 1}`;
    const description = artifact.description || '';
    
    return `
    <div class="artifact">
        <div class="artifact-header">
            <span class="artifact-icon">🖼️</span>
            <span class="artifact-title">スクリーンショット: ${escapeHtml(filename)}</span>
        </div>
        <div class="artifact-content">
            <img 
                class="media-image" 
                src="data:${escapeHtml(artifact.mimeType)};base64,${artifact.data}" 
                alt="${escapeHtml(filename)}"
                title="クリックして拡大/縮小"
            />
            ${description ? `<p class="media-description">${escapeHtml(description)}</p>` : ''}
        </div>
    </div>`;
}

/**
 * ChangeSet Artifactをレンダリング
 */
function renderChangeSetArtifact(artifact: ChangeSetArtifact, index: number): string {
    const commitMessage = artifact.suggestedCommitMessage || '';
    const baseCommitId = artifact.baseCommitId || '';
    const diffHtml = renderDiff(artifact.unidiffPatch);
    
    return `
    <div class="artifact">
        <div class="artifact-header">
            <span class="artifact-icon">📝</span>
            <span class="artifact-title">コード変更 (Diff)</span>
        </div>
        <div class="artifact-content">
            <div class="changeset-info">
                ${baseCommitId ? `
                <div class="changeset-row">
                    <span class="changeset-label">ベースコミット:</span>
                    <code class="changeset-value">${escapeHtml(baseCommitId.substring(0, 8))}</code>
                </div>` : ''}
                ${commitMessage ? `
                <div class="changeset-row">
                    <span class="changeset-label">推奨コミットメッセージ:</span>
                    <code class="changeset-value">${escapeHtml(commitMessage)}</code>
                    <button class="copy-button" onclick="copyToClipboard('${escapeJs(commitMessage)}')">📋 コピー</button>
                </div>` : ''}
            </div>
            <div class="diff-container">
                <pre class="diff-content">${diffHtml}</pre>
            </div>
        </div>
    </div>`;
}

/**
 * Diffをレンダリング（シンタックスハイライト）
 */
function renderDiff(patch: string): string {
    const lines = patch.split('\n');
    return lines.map(line => {
        const escapedLine = escapeHtml(line);
        
        if (line.startsWith('+++') || line.startsWith('---')) {
            return `<span class="diff-line-file">${escapedLine}</span>`;
        } else if (line.startsWith('@@')) {
            return `<span class="diff-line-header">${escapedLine}</span>`;
        } else if (line.startsWith('+')) {
            return `<span class="diff-line-add">${escapedLine}</span>`;
        } else if (line.startsWith('-')) {
            return `<span class="diff-line-remove">${escapedLine}</span>`;
        }
        return escapedLine;
    }).join('\n');
}

/**
 * BashOutput Artifactをレンダリング
 */
function renderBashOutputArtifact(artifact: BashOutputArtifact, index: number): string {
    const isSuccess = artifact.exitCode === 0;
    const exitCodeClass = isSuccess ? 'bash-exit-success' : 'bash-exit-error';
    const exitCodeText = isSuccess ? `✓ 正常終了 (exit code: ${artifact.exitCode})` : `✗ エラー終了 (exit code: ${artifact.exitCode})`;
    
    return `
    <div class="artifact">
        <div class="artifact-header">
            <span class="artifact-icon">💻</span>
            <span class="artifact-title">コマンド実行結果</span>
        </div>
        <div class="artifact-content">
            <div class="bash-command">
                <span class="bash-prompt">$</span>
                <span>${escapeHtml(artifact.command)}</span>
                <button class="copy-button" onclick="copyToClipboard('${escapeJs(artifact.command)}')">📋 コピー</button>
            </div>
            <div class="bash-output">${escapeHtml(artifact.output)}</div>
            <div class="bash-exit-code ${exitCodeClass}">${exitCodeText}</div>
        </div>
    </div>`;
}

/**
 * 不明なArtifactをレンダリング
 */
function renderUnknownArtifact(artifact: BaseArtifact, index: number): string {
    return `
    <div class="artifact">
        <div class="artifact-header">
            <span class="artifact-icon">❓</span>
            <span class="artifact-title">不明なArtifact (${escapeHtml(artifact.type || 'unknown')})</span>
        </div>
        <div class="artifact-content">
            <pre>${escapeHtml(JSON.stringify(artifact, null, 2))}</pre>
        </div>
    </div>`;
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
 * JavaScriptエスケープ（シングルクォート文字列用）
 */
function escapeJs(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

/**
 * Nonce生成
 */
function getNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}
