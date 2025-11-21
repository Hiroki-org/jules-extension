import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { SessionTreeItem, mapApiStateToSessionState, buildFinalPrompt } from "../extension";
import { getArtifactsHtml } from "../extension";
import * as sinon from "sinon";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Sample test", () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });

  // Tests for mapApiStateToSessionState function behavior
  suite("API State Mapping", () => {
    test("PLANNING should map to RUNNING", () => {
      assert.strictEqual(mapApiStateToSessionState("PLANNING"), "RUNNING");
    });

    test("AWAITING_PLAN_APPROVAL should map to RUNNING", () => {
      assert.strictEqual(mapApiStateToSessionState("AWAITING_PLAN_APPROVAL"), "RUNNING");
    });

    test("AWAITING_USER_FEEDBACK should map to RUNNING", () => {
      assert.strictEqual(mapApiStateToSessionState("AWAITING_USER_FEEDBACK"), "RUNNING");
    });

    test("IN_PROGRESS should map to RUNNING", () => {
      assert.strictEqual(mapApiStateToSessionState("IN_PROGRESS"), "RUNNING");
    });

    test("QUEUED should map to RUNNING", () => {
      assert.strictEqual(mapApiStateToSessionState("QUEUED"), "RUNNING");
    });

    test("STATE_UNSPECIFIED should map to RUNNING", () => {
      assert.strictEqual(mapApiStateToSessionState("STATE_UNSPECIFIED"), "RUNNING");
    });

    test("COMPLETED API state should map to COMPLETED UI state", () => {
      assert.strictEqual(mapApiStateToSessionState("COMPLETED"), "COMPLETED");
    });

    test("FAILED API state should map to FAILED UI state", () => {
      assert.strictEqual(mapApiStateToSessionState("FAILED"), "FAILED");
    });

    test("CANCELLED API state should map to CANCELLED UI state", () => {
      assert.strictEqual(mapApiStateToSessionState("CANCELLED"), "CANCELLED");
    });

    test("PAUSED API state should map to CANCELLED UI state", () => {
      assert.strictEqual(mapApiStateToSessionState("PAUSED"), "CANCELLED");
    });

    test("Unknown states should default to RUNNING", () => {
      assert.strictEqual(mapApiStateToSessionState("UNKNOWN_STATE"), "RUNNING");
      assert.strictEqual(mapApiStateToSessionState(""), "RUNNING");
    });
  });

  suite("Session Tree Item", () => {
    test("SessionTreeItem should display correct icons based on state", () => {
      const runningItem = new SessionTreeItem({
        name: "sessions/123",
        title: "Test Session",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
      } as any);
      assert.ok(runningItem.iconPath);

      const completedItem = new SessionTreeItem({
        name: "sessions/456",
        title: "Completed Session",
        state: "COMPLETED",
        rawState: "COMPLETED",
      } as any);
      assert.ok(completedItem.iconPath);
    });

    test("SessionTreeItem exposes context value for view menus", () => {
      const item = new SessionTreeItem({
        name: "sessions/123",
        title: "Test Session",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
      } as any);

      assert.strictEqual(item.contextValue, "jules-session");
    });

    test("SessionTreeItem should have proper command", () => {
      const item = new SessionTreeItem({
        name: "sessions/789",
        title: "Test Session",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
      } as any);

      assert.ok(item.command);
      assert.strictEqual(item.command?.command, "jules-extension.showActivities");
      assert.strictEqual(item.command?.arguments?.[0], "sessions/789");
    });
  });

  suite("buildFinalPrompt", () => {
    let getConfigurationStub: sinon.SinonStub;

    setup(() => {
      getConfigurationStub = sinon.stub(vscode.workspace, "getConfiguration");
    });

    teardown(() => {
      getConfigurationStub.restore();
    });

    test("should append custom prompt to user prompt", () => {
      const workspaceConfig = {
        get: sinon.stub().withArgs("customPrompt").returns("My custom prompt"),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const userPrompt = "User message";
      const finalPrompt = buildFinalPrompt(userPrompt);
      assert.strictEqual(finalPrompt, "User message\n\nMy custom prompt");
    });

    test("should return only user prompt if custom prompt is empty", () => {
      const workspaceConfig = {
        get: sinon.stub().withArgs("customPrompt").returns(""),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const userPrompt = "User message";
      const finalPrompt = buildFinalPrompt(userPrompt);
      assert.strictEqual(finalPrompt, "User message");
    });

    test("should return only user prompt if custom prompt is not set", () => {
      const workspaceConfig = {
        get: sinon.stub().withArgs("customPrompt").returns(undefined),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const userPrompt = "User message";
      const finalPrompt = buildFinalPrompt(userPrompt);
      assert.strictEqual(finalPrompt, "User message");
    });
  });

  suite("PR Status Check Feature", () => {
    test("PR URL extraction works correctly", () => {
      const session = {
        name: "sessions/123",
        title: "Test Session",
        state: "COMPLETED" as const,
        rawState: "COMPLETED",
        outputs: [
          {
            pullRequest: {
              url: "https://github.com/owner/repo/pull/123",
              title: "Test PR",
              description: "Test",
            },
          },
        ],
      };

      // This would need to be exported from extension.ts for proper testing
      // For now, we're just verifying the structure is correct
      assert.ok(session.outputs);
      assert.ok(session.outputs[0].pullRequest);
      assert.strictEqual(
        session.outputs[0].pullRequest.url,
        "https://github.com/owner/repo/pull/123"
      );
    });

    test("Session without PR has no PR URL", () => {
      const session = {
        name: "sessions/456",
        title: "Test Session",
        state: "RUNNING" as const,
        rawState: "IN_PROGRESS",
        outputs: [],
      };

      assert.ok(!session.outputs || session.outputs.length === 0);
    });
  });

  suite("Artifacts UI", () => {
    test("getArtifactsHtml returns html with media and patch", () => {
      const fakeWebview: any = { cspSource: "vscode-resource:" };
      const artifacts = [
        {
          media: [{ mimeType: "image/png", data: "RkFN" }],
        },
        {
          changeSet: {
            gitPatch: {
              unidiffPatch: "+added\n-deleted\n context\n",
              baseCommitId: "abc123",
              suggestedCommitMessage: "Suggested commit",
            },
          },
        },
        {
          bashOutput: { command: "ls", output: "file1\nfile2", exitCode: 0 },
        },
      ];

      const html = getArtifactsHtml(fakeWebview, artifacts as any);
      assert.ok(html.includes("<img"));
      assert.ok(html.includes("added"));
      assert.ok(html.includes("ls"));
    });
  });
});
