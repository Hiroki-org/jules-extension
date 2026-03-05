import * as crypto from "crypto";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import {
  pickFirstNonEmpty,
  getActivitySummaryText,
  getActivityLabelPrefix,
  getActivityIcon,
} from "./activityUtils";
import { formatFullPlan } from "./planUtils";
import { escapeHtml } from "./composer";
import { Activity } from "./types";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  createTime?: string;
  html: string;
}

interface ChatStatePayload {
  sessionId: string | null;
  messages: ChatMessageItem[];
  isTyping: boolean;
}

const markdownRenderer = createMarkdownRenderer();

export function renderChatMarkdown(markdown: string): string {
  return markdownRenderer.render(markdown);
}

const GENERATING_SESSION_STATES: ReadonlySet<string> = new Set([
  "IN_PROGRESS",
  "QUEUED",
  "PLANNING",
]);

export function isGeneratingSessionState(rawState: string | undefined): boolean {
  if (!rawState) {
    return false;
  }
  return GENERATING_SESSION_STATES.has(rawState);
}

export function buildChatMessagesFromActivities(
  activities: Activity[],
  initialPrompt?: string,
  initialTime?: string
): ChatMessageItem[] {
  const customPrompt = vscode.workspace
    .getConfiguration("jules-extension")
    .get<string>("customPrompt", "");

  const sortedActivities = [...activities].sort((a, b) => 
    (a.createTime ?? "").localeCompare(b.createTime ?? "")
  );

  let hasLabeledCustomPrompt = false;

  function formatMessage(message: string): string {
    if (customPrompt && message.includes(customPrompt)) {
      const baseMessage = message.replace(`\n\n${customPrompt}`, "").trim();
      if (!hasLabeledCustomPrompt) {
        hasLabeledCustomPrompt = true;
        // 初回はラベルをつけて表示
        return `${baseMessage}\n\n**[custom prompt]**\n${customPrompt}`;
      } else {
        // 2回目以降は変更がなければ表示しない
        return baseMessage;
      }
    }
    return message;
  }

  const messages: ChatMessageItem[] = [];

  // 重複チェック: 最初のユーザーアクティビティがセッションタイトルを含んでいるか
  const firstUserActivity = sortedActivities.find(a => !!pickFirstNonEmpty(a.userMessaged?.userMessage));
  const firstUserMsgText = firstUserActivity ? pickFirstNonEmpty(firstUserActivity.userMessaged?.userMessage) : null;
  const isInitialPromptRedundant = initialPrompt && firstUserMsgText && (firstUserMsgText === initialPrompt || firstUserMsgText.startsWith(initialPrompt));

  // 1. セッション全体の初期プロンプトがあれば追加 (Activityに含まれない場合や重複しない場合のみ)
  if (initialPrompt && !isInitialPromptRedundant) {
    messages.push({
      id: "session-initial-prompt",
      role: "user",
      createTime: initialTime,
      html: renderChatMarkdown(formatMessage(initialPrompt)),
    });
  }

  sortedActivities.forEach((activity) => {
    const userMessage = pickFirstNonEmpty(activity.userMessaged?.userMessage);
    if (userMessage) {
      messages.push({
        id: activity.id ?? activity.name,
        role: "user",
        createTime: activity.createTime,
        html: renderChatMarkdown(formatMessage(userMessage)),
      });
      return;
    }

    const agentMessage = pickFirstNonEmpty(activity.agentMessaged?.agentMessage);
    if (agentMessage) {
      messages.push({
        id: activity.id ?? activity.name,
        role: "assistant",
        createTime: activity.createTime,
        html: renderChatMarkdown(agentMessage),
      });
      return;
    }

    // その他(進捗、プラン、成功/エラーなど)をログ風の表示としてチャットに混ぜる
    const icon = getActivityIcon(activity);
    const prefix = getActivityLabelPrefix(activity);
    const summary = getActivitySummaryText(activity);
    const combinedText = `${icon} ${prefix}${summary}`;

    let detailsHtml = "";

    // 1. Errors
    if (activity.sessionFailed?.reason) {
      detailsHtml += `<details class="activity-details"><summary>View Error Details</summary><div class="details-content code-block"><pre><code>${escapeHtml(activity.sessionFailed.reason)}</code></pre></div></details>`;
    }

    // 2. Plan
    if (activity.planGenerated?.plan) {
      const planMarkdown = formatFullPlan(activity.planGenerated.plan);
      const planHtml = renderChatMarkdown(planMarkdown);
      detailsHtml += `<details class="activity-details"><summary>View Plan</summary><div class="details-content code-block">${planHtml}</div></details>`;
    }

    // 3. Artifacts / Changesets
    // gitPatch.diff
    if ((activity as any).gitPatch?.diff) {
      const diff = (activity as any).gitPatch.diff;
      if (typeof diff === "string" && diff.trim().length > 0) {
        let highlightedDiff = "";
        try { highlightedDiff = hljs.highlight(diff, { language: "diff" }).value; } catch { highlightedDiff = escapeHtml(diff); }
        detailsHtml += `<details class="activity-details"><summary>View Diff</summary><div class="details-content code-block"><pre><code>${highlightedDiff}</code></pre></div></details>`;
      }
    }

    if (activity.artifacts && activity.artifacts.length > 0) {
      activity.artifacts.forEach((artifact, i) => {
        if (artifact.changeSet) {
          const diffData = (artifact.changeSet as any).gitPatch?.unidiffPatch;
          if (diffData && typeof diffData === "string") {
            let highlightedDiffData = "";
            try { highlightedDiffData = hljs.highlight(diffData, { language: "diff" }).value; } catch { highlightedDiffData = escapeHtml(diffData); }
            detailsHtml += `<details class="activity-details"><summary>View ChangeSet (${i + 1})</summary><div class="details-content code-block"><pre><code>${highlightedDiffData}</code></pre></div></details>`;
          } else {
            let raw = "";
            try { raw = JSON.stringify(artifact.changeSet, null, 2); } catch { raw = String(artifact.changeSet); }
            detailsHtml += `<details class="activity-details"><summary>View ChangeSet Details (${i + 1})</summary><div class="details-content code-block"><pre><code>${escapeHtml(raw)}</code></pre></div></details>`;
          }
        }

        if (artifact.bashOutput) {
          const outRec = artifact.bashOutput as Record<string, any>;
          const stdout = outRec.stdout;
          const stderr = outRec.stderr;
          let commandLine = outRec.commandLine;
          const commands = outRec.commands;
          if (commands && Array.isArray(commands) && commands.length > 0) {
             commandLine = commands[0].commandLine;
          }

          if (commandLine || stdout || stderr) {
            const out = `> ${commandLine || "Command"}\n${stdout || ""}\n${stderr || ""}`.trim();
            detailsHtml += `<details class="activity-details"><summary>View Bash Output (${i + 1})</summary><div class="details-content code-block"><pre><code>${escapeHtml(out)}</code></pre></div></details>`;
          }
        }
      });
    }

    messages.push({
      id: activity.id ?? activity.name,
      role: "assistant", 
      createTime: activity.createTime,
      html: `<div class="activity-log"><em>${escapeHtml(combinedText)}</em></div>${detailsHtml}`,
    });
  });

  return messages;
}

export class JulesChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private state: ChatStatePayload = {
    sessionId: null,
    messages: [],
    isTyping: false,
  };

  constructor(
    private readonly onSendMessage: (sessionId: string, message: string) => Promise<void>,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = getChatWebviewHtml(
      webviewView.webview,
      getNonce(),
    );

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === "requestInitialState") {
        this.postState();
        return;
      }
      if (message?.type !== "sendMessage") {
        return;
      }

      const sessionId =
        typeof message.sessionId === "string" ? message.sessionId : "";
      const text = typeof message.text === "string" ? message.text.trim() : "";
      if (!sessionId || !text) {
        return;
      }

      try {
        await this.onSendMessage(sessionId, text);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });

    this.postState();
  }

  updateSession(sessionId: string, activities: Activity[], rawState?: string, sessionTitle?: string, sessionCreateTime?: string): void {
    this.state = {
      sessionId,
      messages: buildChatMessagesFromActivities(activities, sessionTitle, sessionCreateTime),
      isTyping: isGeneratingSessionState(rawState),
    };
    this.postState();
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    void Promise.resolve(this.view.webview.postMessage({
      type: "chatState",
      payload: this.state,
    })).catch((err: unknown) => console.error("Jules: Failed to post state to chat view:", err));
  }
}

export function getChatWebviewHtml(webview: vscode.Webview, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Jules Chat</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 10px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    #chat {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 2px;
    }
    .message {
      display: flex;
      flex-direction: column;
      max-width: 92%;
      animation: slide-in .18s ease-out;
      gap: 4px;
    }
    .message.user { margin-left: auto; align-items: flex-end; }
    .message.assistant { margin-right: auto; align-items: flex-start; }
    .bubble {
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 12px;
      padding: 10px 12px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .user .bubble {
      background: color-mix(in srgb, var(--vscode-button-background) 28%, transparent);
      border-color: var(--vscode-button-background);
    }
    .assistant .bubble {
      background: color-mix(in srgb, var(--vscode-editorHoverWidget-background) 75%, transparent);
    }
    .meta {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      padding: 0 4px;
    }
    blockquote {
      margin: 8px 0;
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      padding-left: 10px;
      color: var(--vscode-textBlockQuote-foreground);
      background: color-mix(in srgb, var(--vscode-editorHoverWidget-background) 35%, transparent);
      border-radius: 6px;
    }
    ul, ol { padding-left: 18px; margin: 6px 0; }
    p { margin: 0 0 8px; }
    p:last-child { margin-bottom: 0; }
    .code-block {
      position: relative;
      margin: 8px 0;
    }
    .code-block pre {
      margin: 0;
      padding: 10px;
      border-radius: 8px;
      background: var(--vscode-textCodeBlock-background);
      overflow-x: auto;
      border: 1px solid var(--vscode-widget-border, transparent);
    }
    .code-block code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }
    .copy-code-button {
      position: absolute;
      top: 6px;
      right: 6px;
      opacity: 0;
      transition: opacity .15s ease;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 8px;
    }
    .code-block:hover .copy-code-button,
    .copy-code-button:focus-visible {
      opacity: 1;
    }
    .typing {
      display: none;
      align-items: center;
      gap: 4px;
      color: var(--vscode-descriptionForeground);
      padding: 0 4px;
    }
    .typing.visible { display: flex; }
    .typing-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vscode-textLink-foreground);
      animation: pulse 1s infinite ease-in-out;
    }
    .typing-dot:nth-child(2) { animation-delay: .15s; }
    .typing-dot:nth-child(3) { animation-delay: .3s; }
    #composer {
      border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border));
      padding-top: 10px;
      display: grid;
      gap: 8px;
    }
    #messageInput {
      width: 100%;
      resize: vertical;
      min-height: 64px;
      max-height: 180px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 6px;
      padding: 8px;
      font: inherit;
    }
    #messageInput:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    .composer-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .session-label {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 70%;
    }
    #sendButton {
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
    }
    #sendButton:hover { background: var(--vscode-button-hoverBackground); }
    #sendButton:disabled { opacity: .5; cursor: not-allowed; }
    .activity-log {
      font-size: 0.9em;
      opacity: 0.75;
      margin-bottom: 2px;
    }
    .activity-details {
      margin-top: 4px;
      font-size: 0.9em;
    }
    .activity-details summary {
      cursor: pointer;
      user-select: none;
      font-weight: 600;
      opacity: 0.8;
      padding: 2px 0;
      outline: none;
    }
    .activity-details summary:hover {
      opacity: 1;
      text-decoration: underline;
    }
    .details-content {
      margin-top: 6px;
      padding: 10px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      max-height: 350px;
      overflow-y: auto;
    }
    .details-content pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-title { color: var(--vscode-editorKeyword-foreground); }
    .hljs-string, .hljs-attr, .hljs-template-tag { color: var(--vscode-editor-stringForeground); }
    .hljs-number, .hljs-symbol, .hljs-variable { color: var(--vscode-editorInfo-foreground); }
    .hljs-comment, .hljs-quote { color: var(--vscode-editorLineNumber-foreground); }
    .hljs-addition { color: var(--vscode-terminal-ansiBrightGreen, #81b88b); }
    .hljs-deletion { color: var(--vscode-terminal-ansiBrightRed, #c74e39); }
    @keyframes pulse { 0%, 80%, 100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-4px); opacity: 1; } }
    @keyframes slide-in { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  </style>
</head>
<body>
  <div id="chat"></div>
  <div id="typing" class="typing" aria-live="polite" aria-label="Jules is typing">
    <span>Jules is typing</span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  </div>
  <form id="composer">
    <textarea id="messageInput" placeholder="Enter message (Ctrl/Cmd+Enter to send)"></textarea>
    <div class="composer-actions">
      <div id="sessionLabel" class="session-label">Session: None selected</div>
      <button id="sendButton" type="submit" disabled>Send</button>
    </div>
  </form>
  <script nonce="${nonce}">
    const vscode = typeof acquireVsCodeApi === "function"
      ? acquireVsCodeApi()
      : {
        postMessage: () => {
          console.warn("acquireVsCodeApi is not available in preview mode.");
        },
      };
    const chatEl = document.getElementById("chat");
    const typingEl = document.getElementById("typing");
    const formEl = document.getElementById("composer");
    const inputEl = document.getElementById("messageInput");
    const sendButtonEl = document.getElementById("sendButton");
    const sessionLabelEl = document.getElementById("sessionLabel");
    let state = { sessionId: null, messages: [], isTyping: false };

    const updateComposerState = () => {
      const hasSession = typeof state.sessionId === "string" && state.sessionId.length > 0;
      sendButtonEl.disabled = !hasSession || inputEl.value.trim().length === 0;
      sessionLabelEl.textContent = hasSession ? "Session: " + state.sessionId : "Session: None selected";
    };

    const formatTime = (time) => {
      if (!time) return "";
      const date = new Date(time);
      if (Number.isNaN(date.valueOf())) return "";
      return date.toLocaleString();
    };

    const render = () => {
      chatEl.innerHTML = state.messages
        .map((message) => \`
          <div class="message \${message.role}">
            <div class="bubble">\${message.html}</div>
            <div class="meta">\${formatTime(message.createTime)}</div>
          </div>
        \`)
        .join("");
      typingEl.classList.toggle("visible", !!state.isTyping);
      chatEl.scrollTop = chatEl.scrollHeight;
      updateComposerState();
    };

    inputEl.addEventListener("input", updateComposerState);
    inputEl.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        formEl.requestSubmit();
      }
    });

    formEl.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = inputEl.value.trim();
      if (!state.sessionId || !text) {
        return;
      }
      vscode.postMessage({ type: "sendMessage", sessionId: state.sessionId, text });
      inputEl.value = "";
      updateComposerState();
    });

    chatEl.addEventListener("click", async (event) => {
      const button = event.target.closest(".copy-code-button");
      if (!button) {
        return;
      }
      const wrapper = button.closest(".code-block");
      const codeElement = wrapper?.querySelector("code");
      const code = codeElement ? codeElement.innerText : "";
      if (!code) {
        return;
      }
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1200);
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        button.textContent = "Failed";
      }
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.type !== "chatState") {
        return;
      }
      state = message.payload || state;
      render();
    });

    vscode.postMessage({ type: "requestInitialState" });
    render();
  </script>
</body>
</html>`;
}

function createMarkdownRenderer(): MarkdownIt {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    highlight: (source: string, language: string) => {
      if (language && hljs.getLanguage(language)) {
        return `<pre class="hljs"><code>${hljs.highlight(source, {
          language,
          ignoreIllegals: true,
        }).value}</code></pre>`;
      }
      return `<pre class="hljs"><code>${escapeHtml(source)}</code></pre>`;
    },
  });

  const defaultFence = markdown.renderer.rules.fence?.bind(markdown.renderer.rules);
  markdown.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const rendered = defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    return `<div class="code-block"><button class="copy-code-button" type="button">Copy</button>${rendered}</div>`;
  };

  return markdown;
}

// escapeHtml is imported from ./composer

function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}
