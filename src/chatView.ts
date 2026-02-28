import * as crypto from "crypto";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import { pickFirstNonEmpty } from "./activityUtils";
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

export function isGeneratingSessionState(rawState: string | undefined): boolean {
  if (!rawState) {
    return false;
  }
  return new Set(["IN_PROGRESS", "QUEUED", "PLANNING", "EXECUTING_PLAN"]).has(
    rawState,
  );
}

export function buildChatMessagesFromActivities(
  activities: Activity[],
): ChatMessageItem[] {
  const sortedActivities = [...activities].sort((a, b) =>
    (a.createTime ?? "").localeCompare(b.createTime ?? ""),
  );

  const messages: ChatMessageItem[] = [];
  sortedActivities.forEach((activity) => {
    const userMessage = pickFirstNonEmpty(activity.userMessaged?.userMessage);
    if (userMessage) {
      messages.push({
        id: activity.id ?? activity.name,
        role: "user",
        createTime: activity.createTime,
        html: renderChatMarkdown(userMessage),
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
    }
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
  ) { }

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

      await this.onSendMessage(sessionId, text);
    });

    this.postState();
  }

  updateSession(sessionId: string, activities: Activity[], rawState?: string): void {
    this.state = {
      sessionId,
      messages: buildChatMessagesFromActivities(activities),
      isTyping: isGeneratingSessionState(rawState),
    };
    this.postState();
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({
      type: "chatState",
      payload: this.state,
    });
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
    .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-title { color: var(--vscode-editorKeyword-foreground); }
    .hljs-string, .hljs-attr, .hljs-template-tag { color: var(--vscode-editor-stringForeground); }
    .hljs-number, .hljs-symbol, .hljs-variable { color: var(--vscode-editorInfo-foreground); }
    .hljs-comment, .hljs-quote { color: var(--vscode-editorLineNumber-foreground); }
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
    <textarea id="messageInput" placeholder="メッセージを入力 (Ctrl/Cmd+Enter で送信)"></textarea>
    <div class="composer-actions">
      <div id="sessionLabel" class="session-label">Session: 未選択</div>
      <button id="sendButton" type="submit" disabled>送信</button>
    </div>
  </form>
  <script nonce="${nonce}">
    const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage: () => {} };
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
      sessionLabelEl.textContent = hasSession ? "Session: " + state.sessionId : "Session: 未選択";
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
      const code = wrapper ? (wrapper.getAttribute("data-code") || "") : "";
      if (!code) {
        return;
      }
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1200);
      } catch (_error) {
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
    highlight: (source, language) => {
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
  markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const rawCode = tokens[idx].content ?? "";
    const rendered = defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    return `<div class="code-block" data-code="${escapeHtmlAttribute(rawCode)}"><button class="copy-code-button" type="button">Copy</button>${rendered}</div>`;
  };

  return markdown;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}
