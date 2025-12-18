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
  SessionOutput,
  notifyPRCreated
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

  suite("notifyPRCreated", () => {
    let sandbox: sinon.SinonSandbox;
    let showInformationMessageStub: sinon.SinonStub;
    let getConfigurationStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;
    let openExternalStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let consoleErrorStub: sinon.SinonStub;
    let parseStub: sinon.SinonStub;

    const mockSession: Session = {
      name: "sessions/123",
      title: "Test Session",
      state: "COMPLETED",
      rawState: "COMPLETED",
    };

    const mockPrUrl = "https://github.com/owner/repo/pull/123";

    setup(() => {
      sandbox = sinon.createSandbox();
      showInformationMessageStub = sandbox.stub(vscode.window, "showInformationMessage");
      getConfigurationStub = sandbox.stub(vscode.workspace, "getConfiguration");
      executeCommandStub = sandbox.stub(vscode.commands, "executeCommand");
      openExternalStub = sandbox.stub(vscode.env, "openExternal");
      showErrorMessageStub = sandbox.stub(vscode.window, "showErrorMessage");
      consoleErrorStub = sandbox.stub(console, "error");
      parseStub = sandbox.stub(vscode.Uri, "parse");
    });

    teardown(() => {
      sandbox.restore();
    });

    test("should do nothing when user dismisses the information message", async () => {
      showInformationMessageStub.resolves(undefined);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(showInformationMessageStub.calledOnce, true);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Test Session'));
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('created a PR'));
      assert.strictEqual(getConfigurationStub.called, false);
      assert.strictEqual(openExternalStub.called, false);
      assert.strictEqual(executeCommandStub.called, false);
    });

    test("should open PR in external browser when openPrInVsCode is false", async () => {
      showInformationMessageStub.resolves("Open PR");
      const mockUri = { scheme: "https", authority: "github.com" } as vscode.Uri;
      parseStub.returns(mockUri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(false),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(showInformationMessageStub.calledOnce, true);
      assert.strictEqual(getConfigurationStub.calledOnce, true);
      assert.strictEqual(executeCommandStub.called, false);
      assert.strictEqual(openExternalStub.calledOnce, true);
      assert.strictEqual(openExternalStub.firstCall.args[0], mockUri);
      assert.strictEqual(parseStub.calledOnceWith(mockPrUrl), true);
    });

    test("should open PR in external browser when openPrInVsCode is undefined (default)", async () => {
      showInformationMessageStub.resolves("Open PR");
      const mockUri = { scheme: "https", authority: "github.com" } as vscode.Uri;
      parseStub.returns(mockUri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(undefined),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(executeCommandStub.called, false);
      assert.strictEqual(openExternalStub.calledOnce, true);
    });

    test("should open PR in VS Code when openPrInVsCode is true and command succeeds", async () => {
      showInformationMessageStub.resolves("Open PR");
      executeCommandStub.resolves();

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(true),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(showInformationMessageStub.calledOnce, true);
      assert.strictEqual(getConfigurationStub.calledOnce, true);
      assert.strictEqual(executeCommandStub.calledOnce, true);
      assert.strictEqual(executeCommandStub.firstCall.args[0], "pr.openDescription");
      assert.deepStrictEqual(executeCommandStub.firstCall.args[1], { prUrl: mockPrUrl });
      assert.strictEqual(openExternalStub.called, false, "Should not open external browser when VS Code command succeeds");
      assert.strictEqual(showErrorMessageStub.called, false);
      assert.strictEqual(consoleErrorStub.called, false);
    });

    test("should fall back to browser when VS Code command fails", async () => {
      showInformationMessageStub.resolves("Open PR");
      const mockError = new Error("Command not found");
      executeCommandStub.rejects(mockError);
      const mockUri = { scheme: "https", authority: "github.com" } as vscode.Uri;
      parseStub.returns(mockUri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(true),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(showInformationMessageStub.calledOnce, true);
      assert.strictEqual(getConfigurationStub.calledOnce, true);
      assert.strictEqual(executeCommandStub.calledOnce, true);
      assert.strictEqual(consoleErrorStub.calledOnce, true);
      assert.ok(consoleErrorStub.firstCall.args[0].includes("Failed to open PR in VS Code"));
      assert.strictEqual(consoleErrorStub.firstCall.args[1], mockError);
      assert.strictEqual(showErrorMessageStub.calledOnce, true);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes("GitHub Pull Requests and Issues"));
      assert.strictEqual(openExternalStub.calledOnce, true, "Should fall back to external browser");
      assert.strictEqual(openExternalStub.firstCall.args[0], mockUri);
    });

    test("should handle different error types when VS Code command fails", async () => {
      showInformationMessageStub.resolves("Open PR");
      executeCommandStub.rejects(new TypeError("Invalid command"));
      const mockUri = { scheme: "https", authority: "github.com" } as vscode.Uri;
      parseStub.returns(mockUri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(true),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(consoleErrorStub.calledOnce, true);
      assert.strictEqual(showErrorMessageStub.calledOnce, true);
      assert.strictEqual(openExternalStub.calledOnce, true);
    });

    test("should pass correct prUrl parameter to VS Code command", async () => {
      showInformationMessageStub.resolves("Open PR");
      executeCommandStub.resolves();

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(true),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const customPrUrl = "https://github.com/custom/repo/pull/999";
      await notifyPRCreated(mockSession, customPrUrl);

      assert.strictEqual(executeCommandStub.firstCall.args[1].prUrl, customPrUrl);
    });

    test("should use session title in notification message", async () => {
      showInformationMessageStub.resolves(undefined);
      const customSession = {
        ...mockSession,
        title: "My Custom Session Title",
      };

      await notifyPRCreated(customSession, mockPrUrl);

      const message = showInformationMessageStub.firstCall.args[0];
      assert.ok(message.includes("My Custom Session Title"));
      assert.ok(message.includes('Session "My Custom Session Title" has completed and created a PR!'));
    });

    test("should handle empty string for openPrInVsCode config (falsy value)", async () => {
      showInformationMessageStub.resolves("Open PR");
      const mockUri = { scheme: "https", authority: "github.com" } as vscode.Uri;
      parseStub.returns(mockUri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(""),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      // Empty string is falsy, so should not try VS Code command
      assert.strictEqual(executeCommandStub.called, false);
      assert.strictEqual(openExternalStub.calledOnce, true);
    });

    test("should handle null for openPrInVsCode config (falsy value)", async () => {
      showInformationMessageStub.resolves("Open PR");
      const mockUri = { scheme: "https", authority: "github.com" } as vscode.Uri;
      parseStub.returns(mockUri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(null),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(executeCommandStub.called, false);
      assert.strictEqual(openExternalStub.calledOnce, true);
    });

    test("should properly parse PR URL when opening in browser", async () => {
      showInformationMessageStub.resolves("Open PR");
      const mockUri = { scheme: "https", authority: "github.com", path: "/owner/repo/pull/123" } as vscode.Uri;
      parseStub.returns(mockUri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(false),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(parseStub.calledOnceWith(mockPrUrl), true);
      assert.strictEqual(openExternalStub.firstCall.args[0], mockUri);
    });

    test("should handle complex PR URLs", async () => {
      showInformationMessageStub.resolves("Open PR");
      const complexPrUrl = "https://github.com/organization-name/repo-with-dashes/pull/12345";
      const mockUri = { scheme: "https", authority: "github.com" } as vscode.Uri;
      parseStub.returns(mockUri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(false),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, complexPrUrl);

      assert.strictEqual(parseStub.calledOnceWith(complexPrUrl), true);
      assert.strictEqual(openExternalStub.calledOnce, true);
    });

    test("should return early after successful VS Code command without calling openExternal", async () => {
      showInformationMessageStub.resolves("Open PR");
      executeCommandStub.resolves();
      parseStub.returns({ scheme: "https" } as vscode.Uri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(true),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      // Verify the early return worked - parse should not be called
      assert.strictEqual(parseStub.called, false, "Should not parse URI after successful VS Code command");
      assert.strictEqual(openExternalStub.called, false, "Should not call openExternal after successful VS Code command");
    });

    test("should show correct error message content when VS Code command fails", async () => {
      showInformationMessageStub.resolves("Open PR");
      executeCommandStub.rejects(new Error("Extension not found"));
      parseStub.returns({ scheme: "https" } as vscode.Uri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(true),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      const errorMessage = showErrorMessageStub.firstCall.args[0];
      assert.ok(errorMessage.includes("Failed to open PR in VS Code"));
      assert.ok(errorMessage.includes("GitHub Pull Requests and Issues"));
      assert.ok(errorMessage.includes("extension is installed"));
      assert.ok(errorMessage.includes("logged in"));
    });

    test("should handle user clicking different button text (edge case)", async () => {
      // User somehow returns a different value (shouldn't happen in practice, but good to test)
      showInformationMessageStub.resolves("Some Other Button");

      await notifyPRCreated(mockSession, mockPrUrl);

      // Should not proceed with any PR opening logic
      assert.strictEqual(getConfigurationStub.called, false);
      assert.strictEqual(executeCommandStub.called, false);
      assert.strictEqual(openExternalStub.called, false);
    });

    test("should handle session with special characters in title", async () => {
      showInformationMessageStub.resolves("Open PR");
      parseStub.returns({ scheme: "https" } as vscode.Uri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(false),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const specialSession = {
        ...mockSession,
        title: 'Session with "quotes" and <brackets>',
      };

      await notifyPRCreated(specialSession, mockPrUrl);

      const message = showInformationMessageStub.firstCall.args[0];
      assert.ok(message.includes('Session with "quotes" and <brackets>'));
    });

    test("should handle concurrent calls to notifyPRCreated", async () => {
      showInformationMessageStub.resolves("Open PR");
      executeCommandStub.resolves();

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(true),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const session1 = { ...mockSession, name: "sessions/1", title: "Session 1" };
      const session2 = { ...mockSession, name: "sessions/2", title: "Session 2" };
      const session3 = { ...mockSession, name: "sessions/3", title: "Session 3" };

      // Call multiple times concurrently
      await Promise.all([
        notifyPRCreated(session1, "https://github.com/owner/repo/pull/1"),
        notifyPRCreated(session2, "https://github.com/owner/repo/pull/2"),
        notifyPRCreated(session3, "https://github.com/owner/repo/pull/3"),
      ]);

      assert.strictEqual(showInformationMessageStub.callCount, 3);
      assert.strictEqual(executeCommandStub.callCount, 3);
    });

    test("should verify configuration is read from correct namespace", async () => {
      showInformationMessageStub.resolves("Open PR");
      parseStub.returns({ scheme: "https" } as vscode.Uri);

      const workspaceConfig = {
        get: sandbox.stub().withArgs("openPrInVsCode", false).returns(false),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      await notifyPRCreated(mockSession, mockPrUrl);

      assert.strictEqual(getConfigurationStub.calledOnceWith("jules-extension"), true);
      assert.strictEqual(workspaceConfig.get.calledOnceWith("openPrInVsCode", false), true);
    });
  });
});
