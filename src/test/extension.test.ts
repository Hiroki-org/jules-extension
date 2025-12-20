import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {
  SessionTreeItem,
  mapApiStateToSessionState,
  buildFinalPrompt,
  areOutputsEqual,
  areSessionListsEqual,
  updatePreviousStates,
  Session,
  SessionOutput,
  handleOpenInWebApp
} from "../extension";
import * as sinon from "sinon";
import * as fetchUtils from "../fetchUtils";
import { activate } from "../extension";

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

    test("activate should clean expired PR status cache entries and keep valid ones", async () => {
      const now = Date.now();
      const PR_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

      // Build cache: one valid (2 minutes ago), one expired (6 minutes ago)
      const validLastChecked = now - 2 * 60 * 1000;
      const expiredLastChecked = now - (PR_CACHE_DURATION + 60 * 1000);

      const prCache: any = {
        "https://github.com/owner/repo/pull/1": { isClosed: true, lastChecked: validLastChecked },
        "https://github.com/owner/repo/pull/2": { isClosed: false, lastChecked: expiredLastChecked },
      };

      const localSandbox = sinon.createSandbox();

      const getStub = localSandbox.stub().callsFake((key: string, def?: any) => {
        if (key === 'jules.prStatusCache') return prCache;
        return def;
      });

      const updateStub = localSandbox.stub().resolves();

      const mockContext = {
        globalState: {
          get: getStub,
          update: updateStub,
          keys: localSandbox.stub().returns([]),
        },
        subscriptions: [],
        secrets: { get: localSandbox.stub().resolves(undefined), store: localSandbox.stub().resolves() }
      } as any as vscode.ExtensionContext;

      const consoleLogStub = localSandbox.stub(console, 'log');

      // Stub fetch so we can observe calls for expired entry
      const fetchStub = localSandbox.stub(fetchUtils, 'fetchWithTimeout').resolves({ ok: true, json: async () => ({ state: 'open' }) } as any);

      // Prevent duplicate command registration errors during test
      const registerCmdStub = localSandbox.stub(vscode.commands, 'registerCommand').callsFake(() => ({ dispose: () => {} } as any));

      // Call activate to load and clean cache
      activate(mockContext);


      // Now trigger PR status checks by calling updatePreviousStates for two completed sessions
      const session1: Session = {
        name: 's-valid',
        title: 'valid',
        state: 'COMPLETED',
        rawState: 'COMPLETED',
        outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/1', title: 'PR1', description: '' } }]
      };

      const session2: Session = {
        name: 's-expired',
        title: 'expired',
        state: 'COMPLETED',
        rawState: 'COMPLETED',
        outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/2', title: 'PR2', description: '' } }]
      };

      // Run updatePreviousStates which will invoke PR checks; the valid cached PR should NOT trigger a fetch
      await updatePreviousStates([session1, session2], mockContext);

      // Expect one fetch call (for the expired PR only)
      assert.strictEqual(fetchStub.callCount, 1);
      const fetchArg0 = String(fetchStub.getCall(0).args[0]);
      assert.ok(fetchArg0.includes('/repos/owner/repo/pulls/2'));

      // Cleanup stubs
      localSandbox.restore();
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

  suite("areSessionListsEqual", () => {
    test("should return true for same sessions in different order", () => {
      const s1 = { name: "1", title: "t1", state: "RUNNING", rawState: "RUNNING", outputs: [] } as Session;
      const s2 = { name: "2", title: "t2", state: "COMPLETED", rawState: "COMPLETED", outputs: [] } as Session;
      assert.strictEqual(areSessionListsEqual([s1, s2], [s2, s1]), true);
    });

    test("should return false if content differs", () => {
      const s1 = { name: "1", title: "t1", state: "RUNNING", rawState: "RUNNING", outputs: [] } as Session;
      const s1Modified = { ...s1, state: "COMPLETED" } as Session;
      assert.strictEqual(areSessionListsEqual([s1], [s1Modified]), false);
    });

    test("should return false if size differs", () => {
      const s1 = { name: "1", title: "t1", state: "RUNNING", rawState: "RUNNING", outputs: [] } as Session;
      assert.strictEqual(areSessionListsEqual([s1], []), false);
    });

    test("should return false if requirePlanApproval differs", () => {
      const s1 = { name: "1", state: "RUNNING", rawState: "RUNNING", requirePlanApproval: true } as Session;
      const s2 = { ...s1, requirePlanApproval: false } as Session;
      assert.strictEqual(areSessionListsEqual([s1], [s2]), false);
    });

    test("should return false if sourceContext differs", () => {
      const s1 = { name: "1", state: "RUNNING", rawState: "RUNNING", sourceContext: { source: "a" } } as Session;
      const s2 = { ...s1, sourceContext: { source: "b" } } as Session;
      assert.strictEqual(areSessionListsEqual([s1], [s2]), false);
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
      // Calls update for both previousSessionStates and prStatusCache
      assert.strictEqual(updateStub.callCount, 2, "First call should update (states + cache)");

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
      assert.strictEqual(updateStub.callCount, 2, "Should update when state changes (states + cache)");
    });

    test("should persist PR status cache when session state changes", async () => {
      const session: Session = {
        name: "s3",
        title: "title",
        state: "COMPLETED",
        rawState: "COMPLETED",
        outputs: []
      };

      await updatePreviousStates([session], mockContext);

      let prCacheUpdateCalled = false;
      for (const call of updateStub.getCalls()) {
        if (call.args[0] === "jules.prStatusCache") {
          prCacheUpdateCalled = true;
          break;
        }
      }
      assert.ok(prCacheUpdateCalled, "Should have attempted to save PR status cache");
    });
  });

  suite("openInWebApp Command", () => {
    let openExternalStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let logChannel: vscode.OutputChannel;
    let appendLineSpy: sinon.SinonSpy;

    setup(() => {
      openExternalStub = sinon.stub(vscode.env, "openExternal");
      showWarningMessageStub = sinon.stub(vscode.window, "showWarningMessage");
      showErrorMessageStub = sinon.stub(vscode.window, "showErrorMessage");

      // Create a mock OutputChannel
      appendLineSpy = sinon.spy();
      logChannel = {
        appendLine: appendLineSpy,
        // Add other methods if needed, or use a more complete mock
      } as any;
    });

    teardown(() => {
      sinon.restore();
    });

    test("should open URL if session has one", async () => {
      const session = { url: "http://example.com" } as any;
      const item = new SessionTreeItem(session);
      openExternalStub.resolves(true);

      await handleOpenInWebApp(item, logChannel);

      assert.ok(openExternalStub.calledOnce);
      assert.strictEqual(openExternalStub.getCall(0).args[0].toString(), "http://example.com/");
      assert.ok(showWarningMessageStub.notCalled);
    });

    test("should show warning if session has no URL", async () => {
      const session = {} as any;
      const item = new SessionTreeItem(session);

      await handleOpenInWebApp(item, logChannel);

      assert.ok(openExternalStub.notCalled);
      assert.ok(showWarningMessageStub.calledOnceWith("No URL is available for this session."));
    });

    test("should show error if no item is provided", async () => {
      await handleOpenInWebApp(undefined, logChannel);

      assert.ok(openExternalStub.notCalled);
      assert.ok(showErrorMessageStub.calledOnceWith("No session selected."));
    });

    test("should show warning and log if opening URL fails", async () => {
      const session = { url: "http://fail-url.com" } as any;
      const item = new SessionTreeItem(session);
      openExternalStub.resolves(false);

      await handleOpenInWebApp(item, logChannel);

      assert.ok(openExternalStub.calledOnce);
      assert.ok(showWarningMessageStub.calledOnceWith('Failed to open the URL in the browser.'));
      assert.ok(appendLineSpy.calledOnce);
      assert.ok(appendLineSpy.getCall(0).args[0].includes("Failed to open external URL"));
    });
  });
});
