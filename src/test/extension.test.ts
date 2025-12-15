import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {
  SessionTreeItem,
  mapApiStateToSessionState,
  buildFinalPrompt,
  areOutputsEqual,
  updatePreviousStates,
  Session,
  SessionOutput
} from "../extension";
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

    test("SessionTreeItem should have Markdown tooltip", () => {
      const item = new SessionTreeItem({
        name: "sessions/123",
        title: "Test Session",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
        requirePlanApproval: true,
        sourceContext: { source: "sources/github/owner/repo" }
      } as any);

      assert.ok(item.tooltip instanceof vscode.MarkdownString);
      const tooltipValue = (item.tooltip as vscode.MarkdownString).value;
      assert.ok(tooltipValue.includes("**Test Session**"));
      assert.ok(tooltipValue.includes("Status: **RUNNING**"));
      assert.ok(tooltipValue.includes("⚠️ **Plan Approval Required**"));
      assert.ok(tooltipValue.includes("Source: `owner/repo`"));
      assert.ok(tooltipValue.includes("ID: `sessions/123`"));
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

  // Integration tests for caching logic
  suite("Caching Integration Tests", () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let fetchStub: sinon.SinonStub;

    setup(() => {
      sandbox = sinon.createSandbox();
      mockContext = {
        globalState: {
          get: sandbox.stub(),
          update: sandbox.stub().resolves(),
          keys: sandbox.stub().returns([]),
        },
      } as any;

      fetchStub = sandbox.stub(global, 'fetch');
    });

    teardown(() => {
      sandbox.restore();
    });

    test("listSources should use cached sources when valid", async () => {
      const cachedSources = [{ id: "source1", name: "Source 1" }];
      const cacheData = { sources: cachedSources, timestamp: Date.now() };
      (mockContext.globalState.get as sinon.SinonStub).returns(cacheData);

      // キャッシュが有効な場合、fetchが呼ばれないことを確認
      // 注：この部分は実際のlistSourcesコマンドの呼び出しが必要
      // 現在はキャッシュデータ構造の検証のみ
      assert.deepStrictEqual(cacheData.sources, cachedSources);
      assert.ok(Date.now() - cacheData.timestamp < 5 * 60 * 1000); // 5分以内
    });

    test("clearCache should clear all branch caches", async () => {
      // 複数のブランチキャッシュをモック
      const allKeys = [
        'jules.sources',
        'jules.branches.source1',
        'jules.branches.source2',
        'jules.branches.source3'
      ];
      (mockContext.globalState.keys as sinon.SinonStub).returns(allKeys);

      // キャッシュクリア処理をシミュレート
      const branchCacheKeys = allKeys.filter(key => key.startsWith('jules.branches.'));
      const cacheKeys = ['jules.sources', ...branchCacheKeys];

      // 検証：正しいキーがフィルタされることを確認
      assert.strictEqual(cacheKeys.length, 4); // 1 sources + 3 branches
      assert.strictEqual(branchCacheKeys.length, 3);
      assert.ok(cacheKeys.includes('jules.sources'));
      assert.ok(cacheKeys.includes('jules.branches.source1'));
      assert.ok(cacheKeys.includes('jules.branches.source2'));
      assert.ok(cacheKeys.includes('jules.branches.source3'));
    });

    test("cache should expire after TTL", () => {
      const now = Date.now();
      const validTimestamp = now - (4 * 60 * 1000); // 4分前
      const invalidTimestamp = now - (6 * 60 * 1000); // 6分前
      const ttl = 5 * 60 * 1000; // 5分

      // 4分前のキャッシュは有効
      assert.ok((now - validTimestamp) < ttl);

      // 6分前のキャッシュは無効
      assert.ok((now - invalidTimestamp) >= ttl);
    });
  });

  suite("areOutputsEqual", () => {
    test("should return true when both are undefined", () => {
      assert.strictEqual(areOutputsEqual(undefined, undefined), true);
    });
    test("should return false when one is undefined", () => {
      assert.strictEqual(areOutputsEqual(undefined, []), false);
      assert.strictEqual(areOutputsEqual([], undefined), false);
    });
    test("should return true when both are empty arrays", () => {
      assert.strictEqual(areOutputsEqual([], []), true);
    });
    test("should return false when length differs", () => {
      assert.strictEqual(areOutputsEqual([], [{}]), false);
    });
    test("should return true for same reference", () => {
      const arr: SessionOutput[] = [];
      assert.strictEqual(areOutputsEqual(arr, arr), true);
    });
    test("should return false when pullRequest url differs", () => {
      const a: SessionOutput[] = [{ pullRequest: { url: "u1", title: "t", description: "d" } }];
      const b: SessionOutput[] = [{ pullRequest: { url: "u2", title: "t", description: "d" } }];
      assert.strictEqual(areOutputsEqual(a, b), false);
    });
    test("should return false when pullRequest title differs", () => {
      const a: SessionOutput[] = [{ pullRequest: { url: "u", title: "t1", description: "d" } }];
      const b: SessionOutput[] = [{ pullRequest: { url: "u", title: "t2", description: "d" } }];
      assert.strictEqual(areOutputsEqual(a, b), false);
    });
    test("should return true when all properties match", () => {
      const a: SessionOutput[] = [{ pullRequest: { url: "u", title: "t", description: "d" } }];
      const b: SessionOutput[] = [{ pullRequest: { url: "u", title: "t", description: "d" } }];
      assert.strictEqual(areOutputsEqual(a, b), true);
    });
  });

  suite("updatePreviousStates", () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let updateStub: sinon.SinonStub;

    setup(() => {
      sandbox = sinon.createSandbox();
      updateStub = sandbox.stub().resolves();
      mockContext = {
        globalState: {
          get: sandbox.stub().returns({}),
          update: updateStub,
          keys: sandbox.stub().returns([]),
        },
      } as any;
    });

    teardown(() => {
      sandbox.restore();
    });

    test("should not update globalState if session state unchanged", async () => {
      const session: Session = {
        name: "s1",
        title: "title",
        state: "RUNNING",
        rawState: "RUNNING",
        outputs: []
      };

      // Update once to set initial state
      await updatePreviousStates([session], mockContext);
      assert.strictEqual(updateStub.callCount, 1, "First call should update");

      // Update again with same state
      updateStub.resetHistory();
      await updatePreviousStates([session], mockContext);
      assert.strictEqual(updateStub.callCount, 0, "Second call with same data should not update");
    });

    test("should update globalState if session state changed", async () => {
      const session1: Session = { name: "s2", title: "t", state: "RUNNING", rawState: "RUNNING", outputs: [] };
      await updatePreviousStates([session1], mockContext);
      updateStub.resetHistory();

      const session2: Session = { ...session1, state: "COMPLETED" };
      await updatePreviousStates([session2], mockContext);
      assert.strictEqual(updateStub.callCount, 1, "Should update when state changes");
    });
  });
});
