import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildChatMessagesFromActivities,
  getChatWebviewHtml,
  isGeneratingSessionState,
  renderChatMarkdown,
} from "../chatView";

suite("Chat View Unit Test Suite", () => {
  test("buildChatMessagesFromActivities should include user/assistant messages only", () => {
    const messages = buildChatMessagesFromActivities([
      {
        id: "3",
        name: "activities/3",
        createTime: "2025-01-01T00:00:03Z",
        progressUpdated: { title: "ignored" },
      } as any,
      {
        id: "1",
        name: "activities/1",
        createTime: "2025-01-01T00:00:01Z",
        userMessaged: { userMessage: "hello" },
      } as any,
      {
        id: "2",
        name: "activities/2",
        createTime: "2025-01-01T00:00:02Z",
        agentMessaged: { agentMessage: "world" },
      } as any,
    ]);

    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[1].role, "assistant");
  });

  test("renderChatMarkdown should render quote/list/code with copy button wrapper", () => {
    const rendered = renderChatMarkdown(
      "> quote\n\n- item\n\n```ts\nconst x = 1;\n```",
    );
    assert.ok(rendered.includes("<blockquote>"));
    assert.ok(rendered.includes("<ul>"));
    assert.ok(rendered.includes('class="code-block"'));
    assert.ok(rendered.includes('class="copy-code-button"'));
    assert.ok(rendered.includes('class="hljs"'));
  });

  test("isGeneratingSessionState should detect active generation states", () => {
    assert.strictEqual(isGeneratingSessionState("IN_PROGRESS"), true);
    assert.strictEqual(isGeneratingSessionState("PLANNING"), true);
    assert.strictEqual(isGeneratingSessionState("COMPLETED"), false);
    assert.strictEqual(isGeneratingSessionState(undefined), false);
  });

  test("getChatWebviewHtml should include typing indicator and send flow script", () => {
    const html = getChatWebviewHtml(
      { cspSource: "https://example.com" } as vscode.Webview,
      "nonce-123",
    );
    assert.ok(html.includes('id="typing"'));
    assert.ok(html.includes('type: "sendMessage"'));
    assert.ok(html.includes("requestInitialState"));
    assert.ok(html.includes("copy-code-button"));
  });
});
