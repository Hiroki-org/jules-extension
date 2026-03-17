import * as assert from "assert";
import * as vscode from "vscode";
import {
  buildChatMessagesFromActivities,
  getChatWebviewHtml,
  isGeneratingSessionState,
  renderChatMarkdown,
  initMarkdownRenderer,
} from "../chatView";
import { Activity } from "../types";

function createActivity(activity: Partial<Activity>): Activity {
  return {
    id: "id",
    name: "activities/id",
    createTime: "2025-01-01T00:00:00Z",
    ...activity,
  };
}

suite("Chat View Unit Test Suite", function () {
  this.timeout(10000); // Shiki initialization can take longer than default 2s

  suiteSetup(async () => {
    await initMarkdownRenderer();
  });

  test("buildChatMessagesFromActivities should include user/assistant messages and logs", () => {
    const messages = buildChatMessagesFromActivities([
      createActivity({
        id: "3",
        name: "activities/3",
        createTime: "2025-01-01T00:00:03Z",
        progressUpdated: { title: "working..." },
      }),
      createActivity({
        id: "1",
        name: "activities/1",
        createTime: "2025-01-01T00:00:01Z",
        userMessaged: { userMessage: "hello" },
      }),
      createActivity({
        id: "2",
        name: "activities/2",
        createTime: "2025-01-01T00:00:02Z",
        agentMessaged: { agentMessage: "world" },
      }),
    ]);

    assert.strictEqual(messages.length, 3);
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[1].role, "assistant");
    assert.strictEqual(messages[2].role, "assistant");
    assert.ok(messages[2].html.includes("working..."));
  });

  test("renderChatMarkdown should render quote/list/code with copy button wrapper", () => {
    const rendered = renderChatMarkdown(
      "> quote\n\n- item\n\n```ts\nconst x = 1;\n```",
    );
    assert.ok(rendered.includes("<blockquote>"));
    assert.ok(rendered.includes("<ul>"));
    assert.ok(rendered.includes('class="code-block"'));
    assert.ok(rendered.includes('class="copy-code-button"'));
    assert.ok(rendered.includes('class="shiki'));
  });

  test("renderChatMarkdown should render diff and unknown languages without throwing", () => {
    const diffRendered = renderChatMarkdown("```diff\n+ added\n```");
    assert.ok(diffRendered.includes('class="shiki'));

    const unknownRendered = renderChatMarkdown("```rust\nlet x = 1;\n```");
    assert.ok(unknownRendered.includes('class="shiki'));
  });

  test("buildChatMessagesFromActivities should render artifact diff with shiki", () => {
    const messages = buildChatMessagesFromActivities([
      createActivity({
        id: "4",
        name: "activities/4",
        createTime: "2025-01-01T00:00:04Z",
        artifacts: [
          {
            changeSet: {
              gitPatch: {
                unidiffPatch: "diff --git a/a.ts b/a.ts\n+const x = 1;",
              },
            },
          },
        ],
      }),
    ]);

    assert.strictEqual(messages.length, 1);
    assert.ok(messages[0].html.includes("View ChangeSet (1)"));
    assert.ok(messages[0].html.includes('class="shiki'));
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
