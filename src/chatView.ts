import * as crypto from "crypto";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";
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

let markdownRenderer: MarkdownIt | null = null;
let markdownRendererInit: Promise<void> | null = null;

export async function initMarkdownRenderer(): Promise<void> {
  if (markdownRenderer) return;
  if (markdownRendererInit) return markdownRendererInit;

  markdownRendererInit = (async () => {
    try {
      const md = new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
      });

      const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
      md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
        const rendered = defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
        return '<div class="code-block"><button class="copy-code-button" type="button" title="Copy code">Copy</button>' + rendered + '</div>';
      };

      try {
        // @ts-ignore
        const { default: Shiki } = await import("@shikijs/markdown-it");
        // @ts-ignore
        const { createCssVariablesTheme } = await import("shiki");
        const cssVariablesTheme = createCssVariablesTheme({ name: "css-variables", variablePrefix: "--shiki-", variableDefaults: {}, fontStyle: true });
        const shikiPlugin = await Shiki({
          themes: { light: cssVariablesTheme, dark: cssVariablesTheme },
          langs: ["typescript", "javascript", "tsx", "jsx", "python", "java", "go", "csharp", "cpp", "c", "diff", "json", "yaml", "markdown", "bash", "shell", "html", "css"],
          fallbackLanguage: "markdown",
        });
        md.use(shikiPlugin);
      } catch (error) {
        console.error("Jules: Failed to initialize Shiki:", error);
      }
      markdownRenderer = md;
    } catch (error) {
      markdownRendererInit = null;
      throw error;
    }
  })();
  return markdownRendererInit;
}

export function renderChatMarkdown(markdown: string): string {
  if (!markdownRenderer) return escapeHtml(markdown);
  return markdownRenderer.render(markdown);
}

const GENERATING_SESSION_STATES: ReadonlySet<string> = new Set(["IN_PROGRESS", "QUEUED", "PLANNING"]);

export function isGeneratingSessionState(rawState: string | undefined): boolean {
  if (!rawState) return false;
  return GENERATING_SESSION_STATES.has(rawState);
}

export function buildChatMessagesFromActivities(activities: Activity[], initialPrompt?: string, initialTime?: string): ChatMessageItem[] {
  const customPrompt = vscode.workspace.getConfiguration("jules-extension").get<string>("customPrompt", "");
  const sortedActivities = [...activities].sort((a, b) => (a.createTime ?? "").localeCompare(b.createTime ?? ""));
  let hasLabeledCustomPrompt = false;

  function formatMessage(message: string): string {
    if (customPrompt && message.includes(customPrompt)) {
      const baseMessage = message.replace('\n\n' + customPrompt, "").trim();
      if (!hasLabeledCustomPrompt) {
        hasLabeledCustomPrompt = true;
        return baseMessage + '\n\n**[custom prompt]**\n' + customPrompt;
      }
      return baseMessage;
    }
    return message;
  }

  const messages: ChatMessageItem[] = [];
  const firstUserActivity = sortedActivities.find(a => !!pickFirstNonEmpty(a.userMessaged?.userMessage));
  const firstUserMsgText = firstUserActivity ? pickFirstNonEmpty(firstUserActivity.userMessaged?.userMessage) : null;
  const isInitialPromptRedundant = initialPrompt && firstUserMsgText && (firstUserMsgText === initialPrompt || firstUserMsgText.startsWith(initialPrompt));

  if (initialPrompt && !isInitialPromptRedundant) {
    const formatted = formatMessage(initialPrompt);
    messages.push({ id: "session-initial-prompt", role: "user", createTime: initialTime, html: renderChatMarkdown(formatted) });
  }

  sortedActivities.forEach((activity) => {
    const userMessage = pickFirstNonEmpty(activity.userMessaged?.userMessage);
    if (userMessage) {
      const formatted = formatMessage(userMessage);
      messages.push({ id: activity.id ?? activity.name, role: "user", createTime: activity.createTime, html: renderChatMarkdown(formatted) });
      return;
    }
    const agentMessage = pickFirstNonEmpty(activity.agentMessaged?.agentMessage);
    if (agentMessage) {
      messages.push({ id: activity.id ?? activity.name, role: "assistant", createTime: activity.createTime, html: renderChatMarkdown(agentMessage) });
      return;
    }
    const combinedText = getActivityIcon(activity) + ' ' + getActivityLabelPrefix(activity) + getActivitySummaryText(activity);
    let detailsHtml = "";
    if (activity.sessionFailed?.reason) detailsHtml += '<details class="activity-details"><summary>View Error Details</summary><div class="details-content code-block"><pre><code>' + escapeHtml(activity.sessionFailed.reason) + '</code></pre></div></details>';
    if (activity.planGenerated?.plan) detailsHtml += '<details class="activity-details"><summary>View Plan</summary><div class="details-content">' + renderChatMarkdown(formatFullPlan(activity.planGenerated.plan)) + '</div></details>';
    if ((activity as any).gitPatch?.diff) {
      const diff = (activity as any).gitPatch.diff;
      if (typeof diff === "string" && diff.trim().length > 0) detailsHtml += '<details class="activity-details"><summary>View Diff</summary><div class="details-content">' + renderChatMarkdown('```diff\n' + diff + '\n```') + '</div></details>';
    }
    if (activity.artifacts && activity.artifacts.length > 0) {
      activity.artifacts.forEach((artifact, i) => {
        if (artifact.changeSet) {
          const diffData = (artifact.changeSet as any).gitPatch?.unidiffPatch;
          if (diffData && typeof diffData === "string") detailsHtml += '<details class="activity-details"><summary>View ChangeSet (' + (i + 1) + ')</summary><div class="details-content">' + renderChatMarkdown('```diff\n' + diffData + '\n```') + '</div></details>';
          else {
            let raw = ""; try { raw = JSON.stringify(artifact.changeSet, null, 2); } catch { raw = String(artifact.changeSet); }
            detailsHtml += '<details class="activity-details"><summary>View ChangeSet Details (' + (i + 1) + ')</summary><div class="details-content">' + renderChatMarkdown('```json\n' + raw + '\n```') + '</div></details>';
          }
        }
        if (artifact.bashOutput) {
          const outRec = artifact.bashOutput as Record<string, any>;
          let out = ('> ' + (outRec.commandLine || (outRec.commands && outRec.commands[0] && outRec.commands[0].commandLine) || "Command") + '\n' + (outRec.stdout || "") + '\n' + (outRec.stderr || "")).trim();
          detailsHtml += '<details class="activity-details"><summary>View Bash Output (' + (i + 1) + ')</summary><div class="details-content">' + renderChatMarkdown('```bash\n' + out + '\n```') + '</div></details>';
        }
      });
    }
    messages.push({ id: activity.id ?? activity.name, role: "assistant", createTime: activity.createTime, html: '<div class="activity-log"><em>' + escapeHtml(combinedText) + '</em></div>' + detailsHtml });
  });
  return messages;
}

export class JulesChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private activities: Activity[] = [];
  private sessionTitle?: string;
  private sessionCreateTime?: string;
  private state: ChatStatePayload = { sessionId: null, messages: [], isTyping: false };
  constructor(private readonly onSendMessage: (sessionId: string, message: string) => Promise<void>) {}
  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    await initMarkdownRenderer();
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getChatWebviewHtml(webviewView.webview, getNonce());
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === "requestInitialState") { this.postState(); return; }
      if (message?.type !== "sendMessage") return;
      const sessionId = typeof message.sessionId === "string" ? message.sessionId : "";
      const text = typeof message.text === "string" ? message.text.trim() : "";
      if (!sessionId || !text) return;
      try { await this.onSendMessage(sessionId, text); } catch (error) { vscode.window.showErrorMessage('Failed to send message: ' + (error instanceof Error ? error.message : "Unknown error")); }
    });
    if (this.state.sessionId) this.state.messages = buildChatMessagesFromActivities(this.activities, this.sessionTitle, this.sessionCreateTime);
    this.postState();
  }
  updateSession(sessionId: string, activities: Activity[], rawState?: string, sessionTitle?: string, sessionCreateTime?: string): void {
    this.activities = activities; this.sessionTitle = sessionTitle; this.sessionCreateTime = sessionCreateTime;
    this.state = { sessionId, messages: buildChatMessagesFromActivities(activities, sessionTitle, sessionCreateTime), isTyping: isGeneratingSessionState(rawState) };
    this.postState();
  }
  private postState(): void {
    if (!this.view) return;
    void Promise.resolve(this.view.webview.postMessage({ type: "chatState", payload: this.state })).catch((err: unknown) => console.error("Jules: Failed to post state to chat view:", err));
  }
}

export function getChatWebviewHtml(webview: vscode.Webview, nonce: string): string {
  const css = '* { box-sizing: border-box; } body { margin: 0; padding: 10px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); height: 100vh; display: flex; flex-direction: column; gap: 10px; } #chat { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 2px; } .message { display: flex; flex-direction: column; max-width: 92%; animation: slide-in .18s ease-out; gap: 4px; } .message.user { margin-left: auto; align-items: flex-end; } .message.assistant { margin-right: auto; align-items: flex-start; } .bubble { border: 1px solid var(--vscode-widget-border, transparent); border-radius: 12px; padding: 10px 12px; backdrop-filter: blur(8px); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); line-height: 1.5; overflow-wrap: anywhere; } .user .bubble { background: color-mix(in srgb, var(--vscode-button-background) 28%, transparent); border-color: var(--vscode-button-background); } .assistant .bubble { background: color-mix(in srgb, var(--vscode-editorHoverWidget-background) 75%, transparent); } .meta { color: var(--vscode-descriptionForeground); font-size: 11px; padding: 0 4px; } blockquote { margin: 8px 0; border-left: 3px solid var(--vscode-textBlockQuote-border); padding-left: 10px; color: var(--vscode-textBlockQuote-foreground); background: color-mix(in srgb, var(--vscode-editorHoverWidget-background) 35%, transparent); border-radius: 6px; } ul, ol { padding-left: 18px; margin: 6px 0; } p { margin: 0 0 8px; } .code-block { position: relative; margin: 8px 0; } .code-block pre { margin: 0; padding: 10px; border-radius: 8px; background: var(--vscode-textCodeBlock-background); overflow-x: auto; border: 1px solid var(--vscode-widget-border, transparent); } .code-block code { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); } .copy-code-button { position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity .15s ease; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; font-size: 11px; padding: 2px 8px; } .code-block:hover .copy-code-button, .copy-code-button:focus-visible { opacity: 1; } .typing { display: none; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); padding: 0 4px; } .typing.visible { display: flex; } .typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-textLink-foreground); animation: pulse 1s infinite ease-in-out; } .typing-dot:nth-child(2) { animation-delay: .15s; } .typing-dot:nth-child(3) { animation-delay: .3s; } #composer { border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border)); padding-top: 10px; display: grid; gap: 8px; } #messageInput { width: 100%; resize: vertical; min-height: 64px; max-height: 180px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 6px; padding: 8px; font: inherit; } #messageInput:focus-visible { outline: 1px solid var(--vscode-focusBorder); } .composer-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .session-label { color: var(--vscode-descriptionForeground); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; } #sendButton { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; padding: 6px 12px; cursor: pointer; } #sendButton:hover { background: var(--vscode-button-hoverBackground); } #sendButton:disabled { opacity: .5; cursor: not-allowed; } .activity-log { font-size: 0.9em; opacity: 0.75; margin-bottom: 2px; } .activity-details { margin-top: 4px; font-size: 0.9em; } .activity-details summary { cursor: pointer; user-select: none; font-weight: 600; opacity: 0.8; padding: 2px 0; outline: none; } .activity-details summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; } .activity-details summary:hover { opacity: 1; text-decoration: underline; } .details-content { margin-top: 6px; padding: 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); border-radius: 6px; max-height: 350px; overflow-y: auto; } .details-content pre { margin: 0; white-space: pre-wrap; word-break: break-all; } .shiki { background-color: transparent !important; } .shiki span { color: var(--shiki-light); } [data-vscode-theme-kind="vscode-dark"] .shiki span { color: var(--shiki-dark); } [data-vscode-theme-kind="vscode-high-contrast"] .shiki span { color: var(--shiki-dark); } @keyframes pulse { 0%, 80%, 100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-4px); opacity: 1; } } @keyframes slide-in { from { transform: translateY(6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }';
  const js = '(function(){const v=typeof acquireVsCodeApi==="function"?acquireVsCodeApi():null;const c=document.getElementById("chat");const t=document.getElementById("typing");const i=document.getElementById("messageInput");const s=document.getElementById("sendButton");const l=document.getElementById("sessionLabel");let st={sessionId:null,messages:[],isTyping:false};function u(){const h=!!st.sessionId;s.disabled=!h||i.value.trim().length===0;l.textContent=h?"Session: "+st.sessionId:"Session: None selected"}function f(tm){if(!tm)return "";const d=new Date(tm);return isNaN(d.getTime())?"":d.toLocaleString()}function r(){c.innerHTML=st.messages.map(m=>\'<div class="message \'+m.role+\'"><div class="bubble">\'+m.html+\'</div><div class="meta">\'+f(m.createTime)+\'</div></div>\').join("");t.classList.toggle("visible",!!st.isTyping);c.scrollTop=c.scrollHeight;u()}i.addEventListener("input",u);i.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){e.preventDefault();if(!s.disabled){const tx=i.value.trim();v.postMessage({type:"sendMessage",sessionId:st.sessionId,text:tx});i.value="";u()}}});document.getElementById("composer").addEventListener("submit",e=>{e.preventDefault();const tx=i.value.trim();if(st.sessionId&&tx){v.postMessage({type:"sendMessage",sessionId:st.sessionId,text:tx});i.value="";u()}});c.addEventListener("click",async e=>{const b=e.target.closest(".copy-code-button");if(!b)return;const tx=b.closest(".code-block").querySelector("code").innerText;try{await navigator.clipboard.writeText(tx);b.textContent="Copied";setTimeout(()=>b.textContent="Copy",1200)}catch{b.textContent="Failed"}});window.addEventListener("message",e=>{if(e.data.type==="chatState"){st=e.data.payload||st;r()}});v.postMessage({type:"requestInitialState"})})()';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src ' + webview.cspSource + ' \'nonce-' + nonce + '\'; script-src \'nonce-' + nonce + '\';" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Jules Chat</title><style nonce="' + nonce + '">' + css + '</style></head><body><div id="chat"></div><div id="typing" class="typing" aria-live="polite" aria-label="Jules is working"><span>Jules is working</span><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div><form id="composer"><textarea id="messageInput" aria-label="Enter message" placeholder="Enter message (Ctrl/Cmd+Enter to send)"></textarea><div class="composer-actions"><div id="sessionLabel" class="session-label">Session: None selected</div><button id="sendButton" type="submit" aria-label="Send message" disabled>Send</button></div></form><script nonce="' + nonce + '">' + js + '</script></body></html>';
}

function getNonce(): string { return crypto.randomBytes(16).toString("hex"); }
