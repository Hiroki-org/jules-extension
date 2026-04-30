import { CHAT_CSS, CHAT_JS } from "./webview/chatAssets";
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

interface RequestDetailsMessage {
  activityId?: unknown;
  detailType?: unknown;
  index?: unknown;
}

let markdownRenderer: MarkdownIt | null = null;
let markdownRendererInit: Promise<void> | null = null;

export async function initMarkdownRenderer(): Promise<void> {
  if (markdownRenderer) {
    return;
  }
  if (markdownRendererInit) {
    return markdownRendererInit;
  }

  markdownRendererInit = (async () => {
    try {
      const md = new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
      });

      const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
      md.renderer.rules.fence = (
        tokens: any[],
        idx: number,
        options: any,
        env: any,
        self: any,
      ) => {
        const rendered = defaultFence
          ? defaultFence(tokens, idx, options, env, self)
          : self.renderToken(tokens, idx, options);
        return (
          '<div class="code-block"><button class="copy-code-button" type="button" title="Copy code">Copy</button>' +
          rendered +
          "</div>"
        );
      };

      try {
        // @ts-ignore
        const { default: Shiki } = await import("@shikijs/markdown-it");
        // @ts-ignore
        const { createCssVariablesTheme } = await import("shiki");
        const cssVariablesTheme = createCssVariablesTheme({
          name: "css-variables",
          variablePrefix: "--shiki-",
          variableDefaults: {},
          fontStyle: true,
        });
        const shikiPlugin = await Shiki({
          themes: { light: cssVariablesTheme, dark: cssVariablesTheme },
          langs: [
            "typescript",
            "javascript",
            "tsx",
            "jsx",
            "python",
            "java",
            "go",
            "csharp",
            "cpp",
            "c",
            "diff",
            "json",
            "yaml",
            "markdown",
            "bash",
            "shell",
            "html",
            "css",
          ],
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
  if (!markdownRenderer) {
    return escapeHtml(markdown);
  }
  return markdownRenderer.render(markdown);
}

const GENERATING_SESSION_STATES: ReadonlySet<string> = new Set([
  "IN_PROGRESS",
  "QUEUED",
  "PLANNING",
]);

export function isGeneratingSessionState(
  rawState: string | undefined,
): boolean {
  if (!rawState) {
    return false;
  }
  return GENERATING_SESSION_STATES.has(rawState);
}

export function buildChatMessagesFromActivities(
  activities: Activity[],
  initialPrompt?: string,
  initialTime?: string,
): ChatMessageItem[] {
  const customPrompt = vscode.workspace
    .getConfiguration("jules-extension")
    .get<string>("customPrompt", "");
  const sortedActivities = [...activities].sort((a, b) =>
    (a.createTime ?? "").localeCompare(b.createTime ?? ""),
  );
  let hasLabeledCustomPrompt = false;

  function formatMessage(message: string): string {
    if (customPrompt && message.includes(customPrompt)) {
      const baseMessage = message
        .replace(customPrompt + "\n\n", "")
        .replace("\n\n" + customPrompt, "")
        .trim();
      if (!hasLabeledCustomPrompt) {
        hasLabeledCustomPrompt = true;
        return baseMessage + "\n\n**[custom prompt]**\n" + customPrompt;
      }
      return baseMessage;
    }
    return message;
  }

  const messages: ChatMessageItem[] = [];
  const firstUserActivity = sortedActivities.find(
    (a) => !!pickFirstNonEmpty(a.userMessaged?.userMessage),
  );
  const firstUserMsgText = firstUserActivity
    ? pickFirstNonEmpty(firstUserActivity.userMessaged?.userMessage)
    : null;
  const isInitialPromptRedundant =
    initialPrompt &&
    firstUserMsgText &&
    (firstUserMsgText === initialPrompt ||
      firstUserMsgText.startsWith(initialPrompt));

  if (initialPrompt && !isInitialPromptRedundant) {
    const formatted = formatMessage(initialPrompt);
    messages.push({
      id: "session-initial-prompt",
      role: "user",
      createTime: initialTime,
      html: renderChatMarkdown(formatted),
    });
  }

  sortedActivities.forEach((activity) => {
    const userMessage = pickFirstNonEmpty(activity.userMessaged?.userMessage);
    if (userMessage) {
      const formatted = formatMessage(userMessage);
      messages.push({
        id: activity.id ?? activity.name,
        role: "user",
        createTime: activity.createTime,
        html: renderChatMarkdown(formatted),
      });
      return;
    }
    const agentMessage = pickFirstNonEmpty(
      activity.agentMessaged?.agentMessage,
    );
    if (agentMessage) {
      messages.push({
        id: activity.id ?? activity.name,
        role: "assistant",
        createTime: activity.createTime,
        html: renderChatMarkdown(agentMessage),
      });
      return;
    }
    const combinedText =
      getActivityIcon(activity) +
      " " +
      getActivityLabelPrefix(activity) +
      getActivitySummaryText(activity);
    let detailsHtml = "";
    // We lazy load large details: plan, diff, artifacts
    const actId = escapeHtml(activity.id ?? activity.name);
    if (activity.sessionFailed?.reason) {
      detailsHtml +=
        '<details class="activity-details"><summary>View Error Details</summary><div class="details-content code-block"><pre><code>' +
        escapeHtml(activity.sessionFailed.reason) +
        "</code></pre></div></details>";
    }
    if (activity.planGenerated?.plan) {
      detailsHtml +=
        '<details class="activity-details" data-activity-id="' + actId + '" data-detail-type="plan"><summary>View Plan</summary><div class="details-content">Loading...</div></details>';
    }
    if ((activity as any).gitPatch?.diff) {
      const diff = (activity as any).gitPatch.diff;
      if (typeof diff === "string" && diff.trim().length > 0) {
        detailsHtml +=
          '<details class="activity-details" data-activity-id="' + actId + '" data-detail-type="diff"><summary>View Diff</summary><div class="details-content">Loading...</div></details>';
      }
    }
    if (activity.artifacts && activity.artifacts.length > 0) {
      activity.artifacts.forEach((artifact, i) => {
        if (artifact.changeSet) {
          const diffData = (artifact.changeSet as any).gitPatch?.unidiffPatch;
          if (diffData && typeof diffData === "string") {
            detailsHtml +=
              '<details class="activity-details" data-activity-id="' + actId + '" data-detail-type="changeset" data-index="' + i + '"><summary>View ChangeSet (' +
              (i + 1) +
              ')</summary><div class="details-content">Loading...</div></details>';
          } else {
            detailsHtml +=
              '<details class="activity-details" data-activity-id="' + actId + '" data-detail-type="changeset-raw" data-index="' + i + '"><summary>View ChangeSet Details (' +
              (i + 1) +
              ')</summary><div class="details-content">Loading...</div></details>';
          }
        }
        if (artifact.bashOutput) {
          const outRec = artifact.bashOutput as Record<string, any>;
          let commandLine = outRec.commandLine;
          const commands = outRec.commands;
          if (commands && Array.isArray(commands) && commands.length > 0) {
            commandLine = commands[0].commandLine;
          }
          const stdout = outRec.stdout;
          const stderr = outRec.stderr;
          if (commandLine || stdout || stderr) {
            detailsHtml +=
              '<details class="activity-details" data-activity-id="' + actId + '" data-detail-type="bash" data-index="' + i + '"><summary>View Bash Output (' +
              (i + 1) +
              ')</summary><div class="details-content">Loading...</div></details>';
          }
        }
      });
    }
    messages.push({
      id: activity.id ?? activity.name,
      role: "assistant",
      createTime: activity.createTime,
      html:
        '<div class="activity-log"><em>' +
        escapeHtml(combinedText) +
        "</em></div>" +
        detailsHtml,
    });
  });
  return messages;
}

export class JulesChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private activities: Activity[] = [];
  private sessionTitle?: string;
  private sessionCreateTime?: string;
  private state: ChatStatePayload = {
    sessionId: null,
    messages: [],
    isTyping: false,
  };
  constructor(
    private readonly onSendMessage: (
      sessionId: string,
      message: string,
    ) => Promise<void>,
  ) {}
  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    await initMarkdownRenderer();
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getChatWebviewHtml(
      webviewView.webview,
      getNonce(),
    );
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === "requestInitialState") {
        this.postState();
        return;
      }
      if (message?.type === "requestDetails") {
        this.handleRequestDetails(message);
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
          "Failed to send message: " +
            (error instanceof Error ? error.message : "Unknown error"),
        );
      }
    });
    if (this.state.sessionId) {
      this.state.messages = buildChatMessagesFromActivities(
        this.activities,
        this.sessionTitle,
        this.sessionCreateTime,
      );
    }
    this.postState();
  }
  updateSession(
    sessionId: string,
    activities: Activity[],
    rawState?: string,
    sessionTitle?: string,
    sessionCreateTime?: string,
  ): void {
    this.activities = activities;
    this.sessionTitle = sessionTitle;
    this.sessionCreateTime = sessionCreateTime;
    this.state = {
      sessionId,
      messages: buildChatMessagesFromActivities(
        activities,
        sessionTitle,
        sessionCreateTime,
      ),
      isTyping: isGeneratingSessionState(rawState),
    };
    this.postState();
  }
  private handleRequestDetails(message: RequestDetailsMessage): void {
    const activityId =
      typeof message.activityId === "string" ? message.activityId : "";
    const detailType =
      typeof message.detailType === "string" ? message.detailType : "";
    const index = typeof message.index === "number" ? message.index : undefined;
    if (!this.view || !activityId || !detailType) {
      return;
    }
    const activity = this.activities.find(
      (a) => (a.id ?? a.name) === activityId,
    );
    if (!activity) {
      return;
    }
    let html = "Not found";
    if (detailType === "plan" && activity.planGenerated?.plan) {
      html = renderChatMarkdown(formatFullPlan(activity.planGenerated.plan));
    } else if (detailType === "diff" && (activity as any).gitPatch?.diff) {
      const diff = (activity as any).gitPatch.diff;
      if (typeof diff === "string") {
        html = renderChatMarkdown("```diff\n" + diff + "\n```");
      }
    } else if (activity.artifacts && typeof index === "number") {
      const artifact = activity.artifacts[index];
      if (artifact) {
        if (detailType === "changeset" && artifact.changeSet) {
          const diffData = (artifact.changeSet as any).gitPatch?.unidiffPatch;
          if (diffData && typeof diffData === "string") {
            html = renderChatMarkdown("```diff\n" + diffData + "\n```");
          }
        } else if (detailType === "changeset-raw" && artifact.changeSet) {
          let raw = "";
          try {
            raw = JSON.stringify(artifact.changeSet, null, 2);
          } catch {
            raw = String(artifact.changeSet);
          }
          html = renderChatMarkdown("```json\n" + raw + "\n```");
        } else if (detailType === "bash" && artifact.bashOutput) {
          const outRec = artifact.bashOutput as Record<string, any>;
          let commandLine = outRec.commandLine;
          const commands = outRec.commands;
          if (commands && Array.isArray(commands) && commands.length > 0) {
            commandLine = commands[0].commandLine;
          }
          const stdout = outRec.stdout;
          const stderr = outRec.stderr;
          const out = (
            "> " +
            (commandLine || "Command") +
            "\n" +
            (stdout || "") +
            "\n" +
            (stderr || "")
          ).trim();
          html = renderChatMarkdown("```bash\n" + out + "\n```");
        }
      }
    }
    void Promise.resolve(
      this.view.webview.postMessage({
        type: "detailsHtml",
        activityId,
        detailType,
        index,
        html,
      }),
    ).catch((err: unknown) =>
      console.error("Jules: Failed to post detailsHtml to chat view:", err),
    );
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    void Promise.resolve(
      this.view.webview.postMessage({ type: "chatState", payload: this.state }),
    ).catch((err: unknown) =>
      console.error("Jules: Failed to post state to chat view:", err),
    );
  }
}

export function getChatWebviewHtml(
  webview: vscode.Webview,
  nonce: string,
): string {
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src ' +
    webview.cspSource +
    " 'nonce-" +
    nonce +
    "'; script-src 'nonce-" +
    nonce +
    '\';" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Jules Chat</title><style nonce="' +
    nonce +
    '">' +
    CHAT_CSS +
    '</style></head><body><div id="chat"></div><div id="typing" class="typing" aria-live="polite" aria-label="Jules is working"><span>Jules is working</span><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div><form id="composer"><textarea id="messageInput" aria-label="Enter message" placeholder="Enter message (Ctrl/Cmd+Enter to send)"></textarea><div class="composer-actions"><div id="sessionLabel" class="session-label">Session: None selected</div><button id="sendButton" type="submit" aria-label="Send message" disabled>Send</button></div></form><script nonce="' +
    nonce +
    '">' +
    CHAT_JS +
    "</script></body></html>"
  );
}

function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}
