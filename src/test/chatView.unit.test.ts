import * as assert from "assert";
import * as vscode from "vscode";
import {
  JulesChatViewProvider,
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

suite("Chat View Unit Test Suite", () => {
  suiteSetup(async function() {
    this.timeout(5000);
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
    assert.ok(html.includes('type:"sendMessage"') || html.includes('type: "sendMessage"'));
    assert.ok(html.includes("requestInitialState"));
    assert.ok(html.includes("copy-code-button"));
    assert.ok(html.includes('aria-label="Send message"'));
  });

  test("buildChatMessagesFromActivities should generate lazy load placeholders for details", () => {
    const act: any = createActivity({
      id: "act1",
      createTime: "2025-01-01T00:00:01Z",
      planGenerated: { plan: { steps: [{ description: "some plan" }] } as any },
      sessionFailed: { reason: "some error" },
      artifacts: [
        {
          changeSet: { gitPatch: { unidiffPatch: "change diff" } } as any,
          bashOutput: { stdout: "out", stderr: "err", commandLine: "cmd" }
        },
        {
          changeSet: { other: "raw json" } as any
        }
      ]
    });
    act.gitPatch = { diff: "some diff" };

    const messages = buildChatMessagesFromActivities([act]);

    assert.strictEqual(messages.length, 1);
    const html = messages[0].html;

    assert.ok(html.includes("some error"));
    assert.ok(html.includes('data-detail-type="plan"'));
    assert.ok(html.includes('data-detail-type="diff"'));
    assert.ok(html.includes('data-detail-type="changeset"'));
    assert.ok(html.includes('data-detail-type="changeset-raw"'));
    assert.ok(html.includes('data-detail-type="bash"'));
    assert.ok(html.includes("Loading..."));
  });


  suite("JulesChatViewProvider lazy loading", () => {
    test("handleRequestDetails generates HTML and sends back via postMessage", async () => {
      let postedMessage: any;
      const webviewView: any = {
        webview: {
          options: {},
          html: "",
          cspSource: "https://example.com",
          onDidReceiveMessage: (cb: any) => { /* mock */ },
          postMessage: async (msg: any) => { postedMessage = msg; }
        }
      };

      const provider = new JulesChatViewProvider(async () => {});
      // we need to call resolveWebviewView to set this.view
      await provider.resolveWebviewView(webviewView);


      const actProvider: any = createActivity({
        id: "act-1",
        planGenerated: { plan: { steps: [{ description: "test plan" }] } as any },
        artifacts: [{
          changeSet: { gitPatch: { unidiffPatch: "test patch" } } as any,
          bashOutput: { stdout: "out", stderr: "err", commandLine: "cmd" }
        }, {
          changeSet: { data: "test data" } as any
        }]
      });
      actProvider.gitPatch = { diff: "test diff" };

      provider.updateSession("session-1", [actProvider]);


      // Call internal handleRequestDetails using cast to any
      const handleRequestDetails = (provider as any).handleRequestDetails.bind(provider);

      // Test plan
      handleRequestDetails({ activityId: "act-1", detailType: "plan" });
      await new Promise(r => setTimeout(r, 0)); // let microtasks run
      assert.strictEqual(postedMessage.type, "detailsHtml");
      assert.strictEqual(postedMessage.activityId, "act-1");
      assert.strictEqual(postedMessage.detailType, "plan");
      assert.ok(postedMessage.html.includes("test plan"));

      // Test diff
      handleRequestDetails({ activityId: "act-1", detailType: "diff" });
      await new Promise(r => setTimeout(r, 0));
      assert.strictEqual(postedMessage.detailType, "diff");
      assert.ok(postedMessage.html.includes("test diff"));

      // Test changeset
      handleRequestDetails({ activityId: "act-1", detailType: "changeset", index: 0 });
      await new Promise(r => setTimeout(r, 0));
      assert.strictEqual(postedMessage.detailType, "changeset");
      assert.ok(postedMessage.html.includes("test patch"));

      // Test bash
      handleRequestDetails({ activityId: "act-1", detailType: "bash", index: 0 });
      await new Promise(r => setTimeout(r, 0));
      assert.strictEqual(postedMessage.detailType, "bash");
      assert.ok(postedMessage.html.includes("cmd"));
      assert.ok(postedMessage.html.includes("out"));

      // Test changeset-raw
      handleRequestDetails({ activityId: "act-1", detailType: "changeset-raw", index: 1 });
      await new Promise(r => setTimeout(r, 0));
      assert.strictEqual(postedMessage.detailType, "changeset-raw");
      assert.ok(postedMessage.html.includes("test data"));

      // Test invalid activity
      postedMessage = null;
      handleRequestDetails({ activityId: "invalid", detailType: "plan" });
      await new Promise(r => setTimeout(r, 0));
      assert.strictEqual(postedMessage, null);

      // Test missing activityId or detailType
      handleRequestDetails({ detailType: "plan" });
      await new Promise(r => setTimeout(r, 0));
      assert.strictEqual(postedMessage, null);

      handleRequestDetails({ activityId: "act-1" });
      await new Promise(r => setTimeout(r, 0));
      assert.strictEqual(postedMessage, null);

      // Test no view
      const providerNoView = new JulesChatViewProvider(async () => {});
      (providerNoView as any).handleRequestDetails({ activityId: "act-1", detailType: "plan" });

      // Update session with edge cases
      const actEdge: any = {
        id: "act-edge",
        name: "activities/act-edge",
        createTime: "2025-01-01T00:00:00Z",
        artifacts: [{
          changeSet: { gitPatch: { unidiffPatch: 123 } } as any, // not a string
        }, {
          changeSet: BigInt(9007199254740991) as any // invalid json
        }, {
          bashOutput: { commands: [{ commandLine: "cmd2" }] } as any
        }]
      };
      actEdge.gitPatch = { diff: 123 }; // not string
      provider.updateSession("session-2", [actEdge]);

      // Test edge diff
      postedMessage = null;
      handleRequestDetails({ activityId: "act-edge", detailType: "diff" });
      await new Promise(r => setTimeout(r, 0));
      assert.ok(postedMessage && postedMessage.html.includes("Not found"));

      // Test edge changeset diff not string
      postedMessage = null;
      handleRequestDetails({ activityId: "act-edge", detailType: "changeset", index: 0 });
      await new Promise(r => setTimeout(r, 0));
      assert.ok(postedMessage && postedMessage.html.includes("Not found"));

      // Test edge invalid json
      postedMessage = null;
      handleRequestDetails({ activityId: "act-edge", detailType: "changeset-raw", index: 1 });
      await new Promise(r => setTimeout(r, 0));
      assert.ok(postedMessage && postedMessage.html.includes("9007199254740991"));

      // Test bash with commands array
      postedMessage = null;
      handleRequestDetails({ activityId: "act-edge", detailType: "bash", index: 2 });
      await new Promise(r => setTimeout(r, 0));
      assert.ok(postedMessage && postedMessage.html.includes("cmd2"));

      // Test invalid index in artifacts
      postedMessage = null;
      handleRequestDetails({ activityId: "act-edge", detailType: "changeset", index: 999 });
      await new Promise(r => setTimeout(r, 0));
      assert.ok(postedMessage && postedMessage.html === "Not found");

      // Test detailType that does not match any 'if' conditions (e.g., 'unknown')
      postedMessage = null;
      handleRequestDetails({ activityId: "act-edge", detailType: "unknown" });
      await new Promise(r => setTimeout(r, 0));
      assert.ok(postedMessage && postedMessage.html === "Not found");

    });
  });

});
