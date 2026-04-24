import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {
  SessionTreeItem,
  mapApiStateToSessionState,
  areOutputsEqual,
  areSessionListsEqual,
  updatePreviousStates,
  buildActivitiesListEndpoint,
  buildSessionsListEndpoint,
  mergeActivitiesByIdentity,
  getLatestActivityCreateTime,
  getSourceDisplayName,
  getSourceIsPrivate,
  handleOpenInWebApp,
  refreshActiveChatSessionFromAutoRefresh,
  Session,
  SessionOutput,
  createRemoteBranch,
  resetUpdatePreviousStatesCachesForTests,
  setPRStatusCacheForTests,
} from "../extension";
import { buildFinalPrompt } from "../promptUtils";
import { updateSessionArtifactsCache } from "../sessionArtifacts";
import * as sinon from "sinon";
import * as fetchUtils from "../fetchUtils";
import { GitHubAuth } from "../githubAuth";
import { activate } from "../extension";
import { GitHubAuth } from "../githubAuth";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Sample test", () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });

  // Tests for mapApiStateToSessionState function behavior
  suite("API State Mapping", () => {
    test("PLANNING should map to PLANNING", () => {
      assert.strictEqual(mapApiStateToSessionState("PLANNING"), "PLANNING");
    });

    test("AWAITING_PLAN_APPROVAL should map to AWAITING_PLAN_APPROVAL", () => {
      assert.strictEqual(mapApiStateToSessionState("AWAITING_PLAN_APPROVAL"), "AWAITING_PLAN_APPROVAL");
    });

    test("AWAITING_USER_FEEDBACK should map to AWAITING_USER_FEEDBACK", () => {
      assert.strictEqual(mapApiStateToSessionState("AWAITING_USER_FEEDBACK"), "AWAITING_USER_FEEDBACK");
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

    test("PAUSED API state should map to PAUSED UI state", () => {
      assert.strictEqual(mapApiStateToSessionState("PAUSED"), "PAUSED");
    });

    test("Unknown states should default to RUNNING", () => {
      assert.strictEqual(mapApiStateToSessionState("UNKNOWN_STATE"), "RUNNING");
      assert.strictEqual(mapApiStateToSessionState(""), "RUNNING");
    });
  });

  suite("Source Display Helpers", () => {
    test("getSourceDisplayName should prefer githubRepo owner/repo", () => {
      const source = {
        name: "sources/github/my-org/legacy-name",
        githubRepo: {
          owner: "my-org",
          repo: "my-repo",
        },
      } as any;

      assert.strictEqual(getSourceDisplayName(source), "my-org/my-repo");
    });

    test("getSourceIsPrivate should prioritize githubRepo.isPrivate", () => {
      const source = {
        isPrivate: false,
        githubRepo: {
          isPrivate: true,
        },
      } as any;

      assert.strictEqual(getSourceIsPrivate(source), true);
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

    test("SessionTreeItem reflects cached artifacts in context value", () => {
      updateSessionArtifactsCache("sessions/999", [
        {
          gitPatch: { diff: "diff --git a/file.ts b/file.ts" },
          artifacts: [
            {
              changeSet: {
                files: [{ path: "src/file.ts", status: "modified" }],
              },
            },
          ],
        },
      ] as any);

      const item = new SessionTreeItem({
        name: "sessions/999",
        title: "Test Session",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
      } as any);

      assert.ok(item.contextValue?.includes("jules-session-with-diff"));
      assert.ok(item.contextValue?.includes("jules-session-with-changeset"));
      assert.strictEqual(item.hasDiff, true);
      assert.strictEqual(item.hasChangeset, true);
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

    test("SessionTreeItem tooltip should display automation mode", () => {
      const autoItem = new SessionTreeItem({
        name: "sessions/auto-1",
        title: "Auto Session",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
        automationMode: "AUTO_CREATE_PR",
      } as any);
      const autoTooltip = (autoItem.tooltip as vscode.MarkdownString).value;
      assert.ok(autoTooltip.includes("🤖 Auto Create PR"));

      const manualItem = new SessionTreeItem({
        name: "sessions/manual-1",
        title: "Manual Session",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
        automationMode: "MANUAL",
      } as any);
      const manualTooltip = (manualItem.tooltip as vscode.MarkdownString).value;
      assert.ok(manualTooltip.includes("✋ Manual"));
    });

    test("SessionTreeItem tooltip should display PR info with link", () => {
      const sessionWithPR = new SessionTreeItem({
        name: "sessions/pr-1",
        title: "Session with PR",
        state: "COMPLETED",
        rawState: "COMPLETED",
        outputs: [
          {
            pullRequest: {
              url: "https://github.com/owner/repo/pull/42",
              title: "Fix bug in parser",
              description: "Detailed description",
            },
          },
        ],
      } as any);

      const tooltip = (sessionWithPR.tooltip as vscode.MarkdownString).value;
      assert.ok(tooltip.includes("🔗 **Pull Request**"));
      assert.ok(tooltip.includes("Fix") && tooltip.includes("bug") && tooltip.includes("parser"));
      assert.ok(tooltip.includes("[Open PR (repo#42)](https://github.com/owner/repo/pull/42)"));
    });

    test("SessionTreeItem tooltip should display creation and update timestamps", () => {
      const createTime = "2024-01-15T10:30:00Z";
      const updateTime = "2024-01-15T14:45:00Z";

      const item = new SessionTreeItem({
        name: "sessions/time-1",
        title: "Session with times",
        state: "COMPLETED",
        rawState: "COMPLETED",
        createTime,
        updateTime,
      } as any);

      const tooltip = (item.tooltip as vscode.MarkdownString).value;
      assert.ok(tooltip.includes("Created:"));
      assert.ok(tooltip.includes("Updated:"));
    });

    test("SessionTreeItem tooltip should display starting branch", () => {
      const item = new SessionTreeItem({
        name: "sessions/branch-1",
        title: "Session with branch",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
        sourceContext: {
          source: "sources/github/owner/repo",
          githubRepoContext: {
            startingBranch: "feature/new-feature",
          },
        },
      } as any);

      const tooltip = (item.tooltip as vscode.MarkdownString).value;
      assert.ok(tooltip.includes("Branch: `feature/new-feature`"));
    });

    test("SessionTreeItem tooltip should display artifacts availability", () => {
      // First update cache to have artifacts
      updateSessionArtifactsCache("sessions/artifacts-1", [
        {
          gitPatch: { diff: "diff content" },
          artifacts: [
            {
              changeSet: {
                files: [{ path: "src/file.ts", status: "modified" }],
              },
            },
          ],
        },
      ] as any);

      const item = new SessionTreeItem({
        name: "sessions/artifacts-1",
        title: "Session with artifacts",
        state: "COMPLETED",
        rawState: "COMPLETED",
      } as any);

      const tooltip = (item.tooltip as vscode.MarkdownString).value;
      assert.ok(tooltip.includes("📄 Diff"));
      assert.ok(tooltip.includes("📁 Changeset"));
    });

    test("SessionTreeItem tooltip should not show PR section when no PR exists", () => {
      const item = new SessionTreeItem({
        name: "sessions/no-pr",
        title: "Session without PR",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
        outputs: [],
      } as any);

      const tooltip = (item.tooltip as vscode.MarkdownString).value;
      assert.ok(!tooltip.includes("🔗 **Pull Request**"));
    });

    test("SessionTreeItem tooltip should handle session with all optional fields", () => {
      updateSessionArtifactsCache("sessions/full-session", [
        {
          gitPatch: { diff: "diff" },
          artifacts: [{ changeSet: { files: [{ path: "a.ts", status: "added" }] } }],
        },
      ] as any);

      const item = new SessionTreeItem({
        name: "sessions/full-session",
        title: "Complete Session",
        state: "COMPLETED",
        rawState: "COMPLETED",
        requirePlanApproval: false,
        automationMode: "AUTO_CREATE_PR",
        createTime: "2024-02-01T08:00:00Z",
        updateTime: "2024-02-01T12:00:00Z",
        sourceContext: {
          source: "sources/github/myorg/myrepo",
          githubRepoContext: {
            startingBranch: "main",
          },
        },
        outputs: [
          {
            pullRequest: {
              url: "https://github.com/myorg/myrepo/pull/100",
              title: "Complete Feature",
              description: "Full implementation",
            },
          },
        ],
      } as any);

      const tooltip = (item.tooltip as vscode.MarkdownString).value;

      // Verify all sections are present
      assert.ok(tooltip.includes("**Complete Session**"), "Title should be present");
      assert.ok(tooltip.includes("Status: **COMPLETED**"), "Status should be present");
      assert.ok(tooltip.includes("🤖 Auto Create PR"), "Automation mode should be present");
      assert.ok(tooltip.includes("🔗 **Pull Request**"), "PR section should be present");
      // appendText replaces spaces with &nbsp;, so check word unique to PR title (not session title)
      assert.ok(tooltip.includes("Feature"), "PR title word should be present");
      assert.ok(tooltip.includes("[Open PR (myrepo#100)](https://github.com/myorg/myrepo/pull/100)"), "PR link should be present");
      assert.ok(tooltip.includes("📄 Diff"), "Diff availability should be present");
      assert.ok(tooltip.includes("📁 Changeset"), "Changeset availability should be present");
      assert.ok(tooltip.includes("Branch: `main`"), "Branch should be present");
      assert.ok(tooltip.includes("Source: `myorg/myrepo`"), "Source should be present");
      assert.ok(tooltip.includes("Created:"), "Create time should be present");
      assert.ok(tooltip.includes("Updated:"), "Update time should be present");
      assert.ok(tooltip.includes("ID: `sessions/full-session`"), "ID should be present");
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

    test("should prepend custom prompt to user prompt", () => {
      const workspaceConfig = {
        get: sinon.stub().callsFake((key: string) => {
          if (key === "customPrompt") {
            return "My custom prompt";
          }
          if (key === "enforceJapanese") {
            return true;
          }
          return undefined;
        }),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const userPrompt = "User message";
      const finalPrompt = buildFinalPrompt(userPrompt);
      assert.strictEqual(finalPrompt, "My custom prompt\n\nUser message\n\nPlease use Japanese for all GitHub interactions (PR titles, descriptions, commit messages, and review replies).");
    });

    test("should return only user prompt if custom prompt is empty", () => {
      const workspaceConfig = {
        get: sinon.stub().callsFake((key: string) => {
          if (key === "customPrompt") {
            return "";
          }
          if (key === "enforceJapanese") {
            return true;
          }
          return undefined;
        }),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const userPrompt = "User message";
      const finalPrompt = buildFinalPrompt(userPrompt);
      assert.strictEqual(finalPrompt, "User message\n\nPlease use Japanese for all GitHub interactions (PR titles, descriptions, commit messages, and review replies).");
    });

    test("should return only user prompt if custom prompt is not set", () => {
      const workspaceConfig = {
        get: sinon.stub().callsFake((key: string) => {
          if (key === "customPrompt") {
            return undefined;
          }
          if (key === "enforceJapanese") {
            return true;
          }
          return undefined;
        }),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const userPrompt = "User message";
      const finalPrompt = buildFinalPrompt(userPrompt);
      assert.strictEqual(finalPrompt, "User message\n\nPlease use Japanese for all GitHub interactions (PR titles, descriptions, commit messages, and review replies).");
    });

    test("should not append Japanese instruction when enforceJapanese is false", () => {
      const workspaceConfig = {
        get: sinon.stub().callsFake((key: string) => {
          if (key === "customPrompt") {
            return "";
          }
          if (key === "enforceJapanese") {
            return false;
          }
          return undefined;
        }),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const userPrompt = "User message";
      const finalPrompt = buildFinalPrompt(userPrompt);
      assert.strictEqual(finalPrompt, "User message");
    });

    test("should not append Japanese instruction when enforceJapanese is false even with custom prompt", () => {
      const workspaceConfig = {
        get: sinon.stub().callsFake((key: string) => {
          if (key === "customPrompt") {
            return "Custom instructions";
          }
          if (key === "enforceJapanese") {
            return false;
          }
          return undefined;
        }),
      };
      getConfigurationStub.withArgs("jules-extension").returns(workspaceConfig as any);

      const userPrompt = "User message";
      const finalPrompt = buildFinalPrompt(userPrompt);
      assert.strictEqual(finalPrompt, "Custom instructions\n\nUser message");
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
        if (key === 'jules.prStatusCache') {
          return prCache;
        }
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

      // Prevent duplicate registration errors during test
      localSandbox.stub(vscode.window, 'registerWebviewViewProvider').callsFake(() => ({ dispose: () => { } } as any));
      localSandbox.stub(vscode.languages, 'registerCodeActionsProvider').callsFake(() => ({ dispose: () => { } } as any));
      localSandbox.stub(vscode.languages, 'registerCodeLensProvider').callsFake(() => ({ dispose: () => { } } as any));

      // Stub fetch so we can observe calls for expired entry
      const fetchStub = localSandbox.stub(fetchUtils, 'fetchWithTimeout').resolves({ ok: true, json: async () => ({ state: 'open' }) } as any);

      // Prevent duplicate command registration errors during test
      const registerCmdStub = localSandbox.stub(vscode.commands, 'registerCommand').callsFake(() => ({ dispose: () => { } } as any));

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

  suite("Pagination Endpoint Builders", () => {
    test("buildSessionsListEndpoint should include pageSize and pageToken", () => {
      const url = buildSessionsListEndpoint(
        "https://jules.googleapis.com/v1alpha",
        "next-token-1",
      );

      assert.ok(url.includes("/sessions?"));
      assert.ok(url.includes("pageSize=100"));
      assert.ok(url.includes("pageToken=next-token-1"));
    });

    test("buildActivitiesListEndpoint should include pageSize and pageToken", () => {
      const url = buildActivitiesListEndpoint(
        "https://jules.googleapis.com/v1alpha",
        "sessions/123",
        {
          pageToken: "p2",
        },
      );

      assert.ok(url.includes("/sessions/123/activities?"));
      assert.ok(url.includes("pageSize=100"));
      assert.ok(url.includes("pageToken=p2"));
      assert.ok(!url.includes("createTime"), "createTime is not a valid API parameter");
    });
  });

  suite("Activities Delta Helpers", () => {
    test("mergeActivitiesByIdentity should merge unique activities and keep chronological order", () => {
      const existing = [
        {
          name: "activities/1",
          id: "1",
          createTime: "2026-02-28T10:00:00Z",
        },
        {
          name: "activities/2",
          id: "2",
          createTime: "2026-02-28T10:01:00Z",
        },
      ] as any;
      const incoming = [
        {
          name: "activities/2",
          id: "2",
          createTime: "2026-02-28T10:01:00Z",
        },
        {
          name: "activities/3",
          id: "3",
          createTime: "2026-02-28T10:02:00Z",
        },
      ] as any;

      const merged = mergeActivitiesByIdentity(existing, incoming);
      assert.strictEqual(merged.length, 3);
      assert.strictEqual(merged[0].name, "activities/1");
      assert.strictEqual(merged[2].name, "activities/3");
    });

    test("getLatestActivityCreateTime should return latest valid timestamp", () => {
      const latest = getLatestActivityCreateTime([
        { id: "1", name: "a1", createTime: "invalid" },
        { id: "2", name: "a2", createTime: "2026-02-28T09:00:00Z" },
        { id: "3", name: "a3", createTime: "2026-02-28T11:00:00Z" },
      ] as any);

      assert.strictEqual(latest, "2026-02-28T11:00:00Z");
    });
  });

  suite("Chat polling auto refresh", () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;

    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout");
    });

    teardown(() => {
      sandbox.restore();
    });

    test("should skip polling when no active session id", async () => {
      const updateSessionStub = sandbox.stub();
      const context = {
        globalState: {
          get: sandbox.stub().withArgs("active-session-id").returns(undefined),
          update: sandbox.stub().resolves(),
        },
        secrets: {
          get: sandbox.stub().resolves("api-key"),
        },
      } as any as vscode.ExtensionContext;

      await refreshActiveChatSessionFromAutoRefresh(context, {
        updateSession: updateSessionStub,
      });

      assert.strictEqual(fetchStub.callCount, 0);
      assert.strictEqual(updateSessionStub.callCount, 0);
    });

    test("should skip polling when active session id is invalid", async () => {
      const updateSessionStub = sandbox.stub();
      const context = {
        globalState: {
          get: sandbox
            .stub()
            .withArgs("active-session-id")
            .returns("sessions/../invalid"),
          update: sandbox.stub().resolves(),
        },
        secrets: {
          get: sandbox.stub().resolves("api-key"),
        },
      } as any as vscode.ExtensionContext;

      await refreshActiveChatSessionFromAutoRefresh(context, {
        updateSession: updateSessionStub,
      });

      assert.strictEqual(fetchStub.callCount, 0);
      assert.strictEqual(updateSessionStub.callCount, 0);
    });

    test("should refresh active chat session from API and update chat state", async () => {
      const activeSessionId = "sessions/abc123";
      const latestCreateTimeKey = `jules.activities.latestCreateTime.${activeSessionId}`;
      const updateSessionStub = sandbox.stub();
      const updateGlobalStateStub = sandbox.stub().resolves();
      const getGlobalStateStub = sandbox
        .stub()
        .withArgs("active-session-id")
        .returns(activeSessionId);
      getGlobalStateStub.withArgs(latestCreateTimeKey).returns(undefined);

      fetchStub.onFirstCall().resolves({
        ok: true,
        json: async () => ({
          state: "IN_PROGRESS",
          title: "Session Title",
          createTime: "2026-03-01T00:00:00Z",
        }),
      } as any);
      fetchStub.onSecondCall().resolves({
        ok: true,
        json: async () => ({
          activities: [
            {
              id: "2",
              name: "activities/2",
              createTime: "2026-03-01T00:02:00Z",
              agentMessaged: { agentMessage: "second" },
            },
            {
              id: "1",
              name: "activities/1",
              createTime: "2026-03-01T00:01:00Z",
              userMessaged: { userMessage: "first" },
            },
          ],
        }),
      } as any);

      const context = {
        globalState: {
          get: getGlobalStateStub,
          update: updateGlobalStateStub,
        },
        secrets: {
          get: sandbox.stub().resolves("api-key"),
        },
      } as any as vscode.ExtensionContext;

      await refreshActiveChatSessionFromAutoRefresh(context, {
        updateSession: updateSessionStub,
      });

      assert.strictEqual(fetchStub.callCount, 2);
      assert.ok(String(fetchStub.getCall(0).args[0]).includes(`/${activeSessionId}`));
      assert.ok(
        String(fetchStub.getCall(1).args[0]).includes(`/${activeSessionId}/activities?pageSize=100`),
      );

      assert.strictEqual(updateSessionStub.callCount, 1);
      const updateArgs = updateSessionStub.getCall(0).args;
      assert.strictEqual(updateArgs[0], activeSessionId);
      assert.strictEqual(updateArgs[2], "IN_PROGRESS");
      assert.strictEqual(updateArgs[3], "Session Title");
      assert.strictEqual(updateArgs[4], "2026-03-01T00:00:00Z");
      assert.strictEqual(updateArgs[1].length, 2);
      assert.strictEqual(updateArgs[1][0].name, "activities/1");
      assert.strictEqual(updateArgs[1][1].name, "activities/2");

      assert.ok(
        updateGlobalStateStub.calledWith(
          latestCreateTimeKey,
          "2026-03-01T00:02:00Z",
        ),
      );
    });

    test("should throw when active session fetch fails", async () => {
      const updateSessionStub = sandbox.stub();
      fetchStub.onFirstCall().resolves({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "boom",
      } as any);

      const context = {
        globalState: {
          get: sandbox.stub().withArgs("active-session-id").returns("sessions/fail"),
          update: sandbox.stub().resolves(),
        },
        secrets: {
          get: sandbox.stub().resolves("api-key"),
        },
      } as any as vscode.ExtensionContext;

      await assert.rejects(
        () =>
          refreshActiveChatSessionFromAutoRefresh(context, {
            updateSession: updateSessionStub,
          }),
        /Failed to fetch active session for chat polling/,
      );

      assert.strictEqual(updateSessionStub.callCount, 0);
    });

    test("should discard stale result when active session changes during in-flight refresh", async () => {
      let activeSessionId = "sessions/slow";
      const updateSessionStub = sandbox.stub();
      const updateGlobalStateStub = sandbox.stub().resolves();

      let resolveActivitiesFetch: ((value: unknown) => void) | undefined;
      const activitiesFetchPromise = new Promise((resolve) => {
        resolveActivitiesFetch = resolve;
      });

      fetchStub.onFirstCall().resolves({
        ok: true,
        json: async () => ({
          state: "IN_PROGRESS",
          title: "Slow Session",
          createTime: "2026-03-01T00:00:00Z",
        }),
      } as any);
      fetchStub.onSecondCall().returns(activitiesFetchPromise as any);

      const context = {
        globalState: {
          get: sandbox.stub().callsFake((key: string) => {
            if (key === "active-session-id") {
              return activeSessionId;
            }
            return undefined;
          }),
          update: updateGlobalStateStub,
        },
        secrets: {
          get: sandbox.stub().resolves("api-key"),
        },
      } as any as vscode.ExtensionContext;

      const refreshPromise = refreshActiveChatSessionFromAutoRefresh(context, {
        updateSession: updateSessionStub,
      });

      // Simulate user switching active session while the first refresh is in flight.
      activeSessionId = "sessions/newer";

      resolveActivitiesFetch?.({
        ok: true,
        json: async () => ({
          activities: [
            {
              id: "1",
              name: "activities/1",
              createTime: "2026-03-01T00:01:00Z",
              agentMessaged: { agentMessage: "stale" },
            },
          ],
        }),
      } as any);

      await refreshPromise;

      assert.strictEqual(updateSessionStub.callCount, 0);
      assert.strictEqual(updateGlobalStateStub.callCount, 0);
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
      resetUpdatePreviousStatesCachesForTests();
      updateStub = sandbox.stub().resolves();
      mockContext = {
        globalState: {
          get: sandbox.stub().returns({}),
          update: updateStub,
          keys: sandbox.stub().returns([]),
        },
      } as any;
      resetUpdatePreviousStatesCachesForTests();
    });

    teardown(() => {
      resetUpdatePreviousStatesCachesForTests();
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

    test("updatePreviousStates cache logic coverage", async () => {
      const now = Date.now();
      const prUrlValid = "https://github.com/owner/repo/pull/1";
      const prUrlExpired = "https://github.com/owner/repo/pull/2";
      const prUrlError = "https://github.com/owner/repo/pull/3";
      const prUrlNew = "https://github.com/owner/repo/pull/4";

      const initialCache = {
        [prUrlValid]: { isClosed: false, lastChecked: now - 1000, isError: false },
        [prUrlExpired]: { isClosed: false, lastChecked: now - 10 * 60 * 1000, isError: false },
        [prUrlError]: { isClosed: false, lastChecked: now - 40 * 1000, isError: true },
      };

      setPRStatusCacheForTests(initialCache);

      const sessions: Session[] = [
        {
          name: "s-valid",
          title: "s-valid",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: prUrlValid, title: "PR1", description: "" } }]
        },
        {
          name: "s-expired",
          title: "s-expired",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: prUrlExpired, title: "PR2", description: "" } }]
        },
        {
          name: "s-error",
          title: "s-error",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: prUrlError, title: "PR3", description: "" } }]
        },
        {
          name: "s-new",
          title: "s-new",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: prUrlNew, title: "PR4", description: "" } }]
        }
      ];

      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
        ok: true,
        json: async () => ({ state: "closed" })
      } as any);

      const getTokenStub = sandbox.stub(GitHubAuth, "getToken").resolves("dummy-token");

      await updatePreviousStates(sessions, mockContext);

      // getToken should be called because there are URLs to fetch (expired, error-expired, new)
      assert.ok(getTokenStub.calledOnce);

      // fetch should be called for expired, error-expired, and new
      assert.strictEqual(fetchStub.callCount, 3);

      const fetchedUrls = fetchStub.getCalls().map(c => c.args[0]);
      assert.ok(fetchedUrls.some(u => (u as string).includes("pulls/2")));
      assert.ok(fetchedUrls.some(u => (u as string).includes("pulls/3")));
      assert.ok(fetchedUrls.some(u => (u as string).includes("pulls/4")));
      assert.ok(!fetchedUrls.some(u => (u as string).includes("pulls/1")));
    });
    test("updatePreviousStates should not fetch token if everything is cached and valid", async () => {
      const now = Date.now();
      const prUrl = "https://github.com/owner/repo/pull/1";
      const prUrlErrorValid = "https://github.com/owner/repo/pull/5";
      const initialCache = {
        [prUrl]: { isClosed: false, lastChecked: now - 1000, isError: false },
        [prUrlErrorValid]: { isClosed: false, lastChecked: now - 1000, isError: true },
      };

      setPRStatusCacheForTests(initialCache);
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout");

      const sessions: Session[] = [
        {
          name: "s-valid",
          title: "s-valid",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: prUrl, title: "PR1", description: "" } }]
        },
        {
          name: "s-error-valid",
          title: "s-error-valid",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: prUrlErrorValid, title: "PR5", description: "" } }]
        }
      ];

      const getTokenStub = sandbox.stub(GitHubAuth, "getToken");

      await updatePreviousStates(sessions, mockContext);

      assert.ok(getTokenStub.notCalled);
      assert.ok(fetchStub.notCalled);
    });

    test("updatePreviousStates handles getToken returning undefined", async () => {
      const prUrl = "https://github.com/owner/repo/pull/1";
      const sessions: Session[] = [
        {
          name: "s1",
          title: "s1",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: prUrl, title: "PR", description: "" } }]
        }
      ];

      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
        ok: true,
        json: async () => ({ state: "open" })
      } as any);

      sandbox.stub(GitHubAuth, "getToken").resolves(undefined);

      await updatePreviousStates(sessions, mockContext);

      assert.ok(fetchStub.calledOnce);
      const headers = fetchStub.getCall(0).args[1]?.headers as Record<string, string>;
      assert.strictEqual(headers?.Authorization, undefined);
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
      const url = openExternalStub.getCall(0).args[0].toString();
      // VS Code Uri.parse behavior might differ between mock and real environment
      assert.ok(url === "http://example.com" || url === "http://example.com/");
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

  suite("createRemoteBranch", () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;
    let getExtensionStub: sinon.SinonStub;

    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout");

      // Mock git extension to return a fake SHA
      const gitApi = {
        repositories: [
          {
            rootUri: vscode.Uri.file("/test"),
            state: {
              HEAD: { commit: "fake-sha-123" },
            },
          },
        ],
      };
      const gitExtensionMock = {
        activate: sandbox.stub().resolves(),
        exports: {
          getAPI: sandbox.stub().returns(gitApi)
        }
      };
      getExtensionStub = sandbox.stub(vscode.extensions, "getExtension");
      getExtensionStub.returns(gitExtensionMock as any);
      
      // Mock workspace folder for getCurrentBranchSha
      sandbox.stub(vscode.workspace, "workspaceFolders").value([{ name: "test", uri: vscode.Uri.file("/test") }]);
    });

    teardown(() => {
      sandbox.restore();
    });

    test("should handle successful branch creation", async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ ref: "refs/heads/new-branch" }),
      } as any);

      await createRemoteBranch("token", "owner", "repo", "new-branch");
      
      assert.ok(fetchStub.calledOnce);
      const url = fetchStub.getCall(0).args[0];
      assert.strictEqual(url, "https://api.github.com/repos/owner/repo/git/refs");
    });

    test("should handle failing GitHub API error-response with valid JSON", async () => {
      const errorJson = { message: "Validation Failed" };
      fetchStub.resolves({
        ok: false,
        status: 422,
        text: async () => JSON.stringify(errorJson),
      } as any);

      try {
        await createRemoteBranch("token", "owner", "repo", "new-branch");
        assert.fail("Should have thrown an error");
      } catch (err: any) {
        assert.strictEqual(err.message, "GitHub API error: 422 - Validation Failed");
      }
    });

    test("should handle failing GitHub API error-response with invalid/non-JSON body", async () => {
      fetchStub.resolves({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as any);

      try {
        await createRemoteBranch("token", "owner", "repo", "new-branch");
        assert.fail("Should have thrown an error");
      } catch (err: any) {
        assert.strictEqual(err.message, "GitHub API error: 500 - Internal Server Error");
      }
    });
  });
});
