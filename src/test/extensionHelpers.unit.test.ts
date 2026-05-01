import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as extension from "../extension";
import { Activity } from "../types";
import {
  Session,
  SessionOutput,
  SessionTreeItem,
  areOutputsEqual,
  areSessionListsEqual,
  buildActivitiesListEndpoint,
  buildSessionsListEndpoint,
  createRemoteBranch,
  extractPRs,
  getLatestActivityCreateTime,
  getSourceDisplayName,
  getSourceIsPrivate,
  handleOpenInWebApp,
  isInferredActivityLogKey,
  mapApiStateToSessionState,
  mergeActivitiesByIdentity,
  resetUpdatePreviousStatesCachesForTests,
  updatePreviousStates,
  checkPRStatus,
  buildActivitySummaryHeader,
} from "../extension";
import { updateSessionArtifactsCache } from "../sessionArtifacts";
import * as fetchUtils from "../fetchUtils";
import { GitHubAuth } from "../githubAuth";

suite("Extension helper unit tests", () => {
  suite("state and source helpers", () => {
    test("mapApiStateToSessionState should map known and unknown states", () => {
      assert.strictEqual(mapApiStateToSessionState("IN_PROGRESS"), "RUNNING");
      assert.strictEqual(mapApiStateToSessionState("PLANNING"), "PLANNING");
      assert.strictEqual(
        mapApiStateToSessionState("AWAITING_PLAN_APPROVAL"),
        "AWAITING_PLAN_APPROVAL",
      );
      assert.strictEqual(mapApiStateToSessionState("FAILED"), "FAILED");
      assert.strictEqual(mapApiStateToSessionState("unknown"), "RUNNING");
    });

    test("source helpers should prefer githubRepo metadata and fall back safely", () => {
      assert.strictEqual(
        getSourceDisplayName({
          name: "sources/github/org/legacy",
          githubRepo: { owner: "org", repo: "repo" },
        } as any),
        "org/repo",
      );
      assert.strictEqual(
        getSourceDisplayName({ name: "sources/github/org/repo" } as any),
        "org/repo",
      );
      assert.strictEqual(
        getSourceDisplayName({ id: "source-1" } as any),
        "source-1",
      );

      assert.strictEqual(
        getSourceIsPrivate({
          isPrivate: false,
          githubRepo: { isPrivate: true },
        } as any),
        true,
      );
      assert.strictEqual(getSourceIsPrivate({ isPrivate: false } as any), false);
      assert.strictEqual(getSourceIsPrivate({} as any), undefined);
    });

    test("extractPRs should deduplicate PRs by URL and keep first-seen order", () => {
      const prs = extractPRs({
        outputs: [
          {
            pullRequest: {
              url: "https://github.com/org/repo/pull/1",
              title: "One",
              description: "A",
            },
          },
          {
            pullRequest: {
              url: "https://github.com/org/repo/pull/2",
              title: "Two",
              description: "B",
            },
          },
          {
            pullRequest: {
              url: "https://github.com/org/repo/pull/1",
              title: "Updated title",
              description: "C",
            },
          },
          {},
        ],
      } as any);

      assert.deepStrictEqual(
        prs.map((pr) => [pr.url, pr.title]),
        [
          ["https://github.com/org/repo/pull/1", "Updated title"],
          ["https://github.com/org/repo/pull/2", "Two"],
        ],
      );
    });
  });

  suite("comparison and activity helpers", () => {
    test("isInferredActivityLogKey should exclude known base and union keys", () => {
      assert.strictEqual(isInferredActivityLogKey("id"), false);
      assert.strictEqual(isInferredActivityLogKey("type"), false);
      assert.strictEqual(isInferredActivityLogKey("planGenerated"), false);
      assert.strictEqual(isInferredActivityLogKey("customDiagnostic"), true);
    });

    test("session comparison helpers should detect equality and mismatches", () => {
      const outputsA: SessionOutput[] = [
        {
          pullRequest: {
            url: "https://github.com/org/repo/pull/1",
            title: "PR",
            description: "Desc",
          },
        },
      ];
      const outputsB: SessionOutput[] = [
        {
          pullRequest: {
            url: "https://github.com/org/repo/pull/1",
            title: "PR",
            description: "Desc",
          },
        },
      ];
      const outputsC: SessionOutput[] = [
        {
          pullRequest: {
            url: "https://github.com/org/repo/pull/2",
            title: "PR",
            description: "Desc",
          },
        },
      ];

      assert.strictEqual(areOutputsEqual(outputsA, outputsB), true);
      assert.strictEqual(areOutputsEqual(outputsA, outputsC), false);

      const sessionA = {
        name: "sessions/1",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
        outputs: outputsA,
      } as Session;
      const sessionB = {
        name: "sessions/1",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
        outputs: outputsB,
      } as Session;
      const sessionC = {
        name: "sessions/2",
        state: "COMPLETED",
        rawState: "COMPLETED",
        outputs: outputsC,
      } as Session;

      assert.strictEqual(areSessionListsEqual([sessionA], [sessionB]), true);
      assert.strictEqual(areSessionListsEqual([sessionA], [sessionC]), false);
    });

    test("activity helpers should merge by identity and pick the latest timestamp", () => {
      const merged = mergeActivitiesByIdentity(
        [
          { name: "activities/1", createTime: "2026-02-28T10:00:00Z" },
          { name: "activities/2", createTime: "2026-02-28T10:01:00Z" },
        ] as any,
        [
          { name: "activities/2", createTime: "2026-02-28T10:02:00Z" },
          { id: "3", createTime: "invalid" },
        ] as any,
      );

      assert.strictEqual(merged.length, 3);
      assert.ok(
        merged.some(
          (activity) =>
            activity.name === "activities/2" &&
            activity.createTime === "2026-02-28T10:02:00Z",
        ),
      );
      assert.strictEqual(
        getLatestActivityCreateTime([
          { id: "1", createTime: "invalid" },
          { id: "2", createTime: "2026-02-28T09:00:00Z" },
          { id: "3", createTime: "2026-02-28T11:00:00Z" },
        ] as any),
        "2026-02-28T11:00:00Z",
      );
    });

    test("endpoint builders should include pagination parameters", () => {
      assert.ok(
        buildSessionsListEndpoint("https://example.test/api", "next-page").includes(
          "pageToken=next-page",
        ),
      );
      assert.ok(
        buildActivitiesListEndpoint(
          "https://example.test/api",
          "sessions/123",
          { pageToken: "page-2" },
        ).includes("pageToken=page-2"),
      );
    });
  });

  suite("checkPRStatus", () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
      sandbox = sinon.createSandbox();
      resetUpdatePreviousStatesCachesForTests();
    });

    teardown(() => {
      sandbox.restore();
      resetUpdatePreviousStatesCachesForTests();
    });

    test("should use token if provided and check github status without token if undefined", async () => {
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
        ok: true,
        json: async () => ({ state: "closed" }),
      } as any);

      // With token
      const isClosedToken = await checkPRStatus("https://github.com/org/repo/pull/123", "dummy-token");
      assert.strictEqual(isClosedToken, true);
      assert.strictEqual(fetchStub.callCount, 1);
      const headersToken = fetchStub.firstCall.args[1]?.headers as Record<string, string>;
      assert.strictEqual(headersToken?.Authorization, "Bearer dummy-token");

      resetUpdatePreviousStatesCachesForTests();

      // Without token
      const isClosedNoToken = await checkPRStatus("https://github.com/org/repo/pull/124", undefined);
      assert.strictEqual(isClosedNoToken, true);
      assert.strictEqual(fetchStub.callCount, 2);
      const headersNoToken = fetchStub.secondCall.args[1]?.headers as Record<string, string>;
      assert.strictEqual(headersNoToken?.Authorization, undefined);
    });

    test("should handle 4xx/5xx API errors properly and cache as error", async () => {
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as any);

      const isClosed = await checkPRStatus("https://github.com/org/repo/pull/999", undefined);
      assert.strictEqual(isClosed, false);
      
      // The second call should use cache and not fetch again immediately
      const isClosedCached = await checkPRStatus("https://github.com/org/repo/pull/999", undefined);
      assert.strictEqual(isClosedCached, false);
      assert.strictEqual(fetchStub.callCount, 1); // Not incremented, served from error cache
    });

    test("should return false for invalid GitHub PR URLs without fetching", async () => {
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout");

      const isClosed = await checkPRStatus("not-a-github-pr-url", undefined);

      assert.strictEqual(isClosed, false);
      assert.strictEqual(fetchStub.called, false);

      const cachedResult = await checkPRStatus("not-a-github-pr-url", undefined);
      assert.strictEqual(cachedResult, false);
      assert.strictEqual(fetchStub.called, false);
    });

    test("should handle fetch exceptions and cache as error", async () => {
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").rejects(new Error("Network failure"));
      const isClosed = await checkPRStatus("https://github.com/org/repo/pull/888", undefined);
      assert.strictEqual(isClosed, false);
      assert.strictEqual(fetchStub.callCount, 1);
      const isClosedCached = await checkPRStatus("https://github.com/org/repo/pull/888", undefined);
      assert.strictEqual(isClosedCached, false);
      assert.strictEqual(fetchStub.callCount, 1);
    });
  });

  suite("updatePreviousStates", () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
      sandbox = sinon.createSandbox();
      resetUpdatePreviousStatesCachesForTests();
    });

    teardown(() => {
      sandbox.restore();
      resetUpdatePreviousStatesCachesForTests();
    });

    test("deduplicates PR status checks for shared PR URLs", async () => {
      const tokenStub = sandbox.stub(GitHubAuth, "getToken").resolves("token");
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
        ok: true,
        json: async () => ({ state: "open" }),
      } as any);
      const updateStub = sandbox.stub().resolves();

      const mockContext = {
        globalState: {
          get: sandbox.stub().returns(undefined),
          update: updateStub,
        },
      } as unknown as vscode.ExtensionContext;

      const sharedPrUrl = "https://github.com/org/repo/pull/999991";
      const sessions: Session[] = [
        {
          name: "sessions/pr-status-dedupe-1",
          title: "dedupe-1",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: sharedPrUrl, title: "PR 999991" } } as any],
        },
        {
          name: "sessions/pr-status-dedupe-2",
          title: "dedupe-2",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: sharedPrUrl, title: "PR 999991" } } as any],
        },
      ];

      await updatePreviousStates(sessions, mockContext);

      assert.strictEqual(tokenStub.callCount, 1);
      assert.strictEqual(fetchStub.callCount, 1);
      const stateUpdate = updateStub
        .getCalls()
        .filter((call) => call.args[0] === "jules.previousSessionStates")
        .at(-1);
      assert.ok(stateUpdate);
      const savedStates = stateUpdate?.args[1] as Record<
        string,
        { isTerminated?: boolean }
      >;
      assert.strictEqual(savedStates["sessions/pr-status-dedupe-1"].isTerminated, false);
      assert.strictEqual(savedStates["sessions/pr-status-dedupe-2"].isTerminated, false);
    });

    test("reuses cached session PRs and terminates sessions when all PRs are closed", async () => {
      const tokenStub = sandbox.stub(GitHubAuth, "getToken").resolves("token");
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").callsFake(async () => {
        return {
          ok: true,
          json: async () => ({ state: "closed" }),
        } as any;
      });
      const updateStub = sandbox.stub().resolves();

      const mockContext = {
        globalState: {
          get: sandbox.stub().returns(undefined),
          update: updateStub,
        },
      } as unknown as vscode.ExtensionContext;

      const prUrl1 = "https://github.com/org/repo/pull/999992";
      const prUrl2 = "https://github.com/org/repo/pull/999993";
      const sessions: Session[] = [
        {
          name: "sessions/pr-status-closed-1",
          title: "closed-1",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [
            { pullRequest: { url: prUrl1, title: "PR 999992" } } as any,
            { pullRequest: { url: prUrl2, title: "PR 999993" } } as any,
          ],
        },
        {
          name: "sessions/pr-status-closed-2",
          title: "closed-2",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: prUrl2, title: "PR 999993" } } as any],
        },
      ];

      await updatePreviousStates(sessions, mockContext);

      assert.strictEqual(tokenStub.callCount, 1);
      assert.strictEqual(fetchStub.callCount, 2);
      const stateUpdate = updateStub
        .getCalls()
        .filter((call) => call.args[0] === "jules.previousSessionStates")
        .at(-1);
      assert.ok(stateUpdate);
      const savedStates = stateUpdate?.args[1] as Record<
        string,
        { isTerminated?: boolean }
      >;
      assert.strictEqual(savedStates["sessions/pr-status-closed-1"].isTerminated, true);
      assert.strictEqual(savedStates["sessions/pr-status-closed-2"].isTerminated, true);
    });

    test("skips token fetch when all PRs are freshly cached", async () => {
      const tokenStub = sandbox.stub(GitHubAuth, "getToken").resolves("token");
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
        ok: true,
        json: async () => ({ state: "open" }),
      } as any);
      const updateStub = sandbox.stub().resolves();

      const mockContext = {
        globalState: {
          get: sandbox.stub().returns(undefined),
          update: updateStub,
        },
      } as unknown as vscode.ExtensionContext;

      const sessions: Session[] = [
        {
          name: "sessions/fresh-cache",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: "https://github.com/org/repo/pull/111" } } as any],
        } as Session,
      ];

      // First call to populate cache
      await updatePreviousStates(sessions, mockContext);
      assert.strictEqual(tokenStub.callCount, 1);
      assert.strictEqual(fetchStub.callCount, 1);

      // Second call should hit cache and NOT fetch token or PR
      tokenStub.resetHistory();
      fetchStub.resetHistory();
      await updatePreviousStates(sessions, mockContext);
      
      assert.strictEqual(tokenStub.callCount, 0, "getToken should not be called when cache is fresh");
      assert.strictEqual(fetchStub.callCount, 0, "fetchWithTimeout should not be called when cache is fresh");
    });

    test("re-fetches error cached entries after PR_ERROR_CACHE_DURATION", async () => {
      const clock = sandbox.useFakeTimers(Date.now());
      
      const tokenStub = sandbox.stub(GitHubAuth, "getToken").resolves("token");
      const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout");
      
      // First fetch returns an error
      fetchStub.onFirstCall().resolves({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as any);
      
      const updateStub = sandbox.stub().resolves();
      const mockContext = {
        globalState: {
          get: sandbox.stub().returns(undefined),
          update: updateStub,
        },
      } as unknown as vscode.ExtensionContext;

      const sessions: Session[] = [
        {
          name: "sessions/error-cache",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [{ pullRequest: { url: "https://github.com/org/repo/pull/222" } } as any],
        } as Session,
      ];

      await updatePreviousStates(sessions, mockContext);
      assert.strictEqual(fetchStub.callCount, 1);
      
      // Fast forward 31 seconds (past PR_ERROR_CACHE_DURATION of 30s)
      clock.tick(31000);
      
      // Second fetch should succeed
      fetchStub.onSecondCall().resolves({
        ok: true,
        json: async () => ({ state: "closed" }),
      } as any);
      
      tokenStub.resetHistory();
      await updatePreviousStates(sessions, mockContext);
      
      assert.strictEqual(tokenStub.callCount, 1, "getToken should be called after error cache expires");
      assert.strictEqual(fetchStub.callCount, 2, "fetchWithTimeout should be called after error cache expires");
      
      const stateUpdate = updateStub
        .getCalls()
        .filter((call) => call.args[0] === "jules.previousSessionStates")
        .at(-1);
      const savedStates = stateUpdate?.args[1] as Record<string, { isTerminated?: boolean }>;
      assert.strictEqual(savedStates["sessions/error-cache"].isTerminated, true);
    });

    test("does not terminate COMPLETED session with no PRs", async () => {
      const updateStub = sandbox.stub().resolves();
      const mockContext = {
        globalState: {
          get: sandbox.stub().returns(undefined),
          update: updateStub,
        },
      } as unknown as vscode.ExtensionContext;

      const sessions: Session[] = [
        {
          name: "sessions/no-pr",
          title: "no-pr",
          state: "COMPLETED",
          rawState: "COMPLETED",
          outputs: [], // No PRs
        } as Session,
      ];

      await updatePreviousStates(sessions, mockContext);

      const stateUpdate = updateStub
        .getCalls()
        .filter((call) => call.args[0] === "jules.previousSessionStates")
        .at(-1);
      assert.ok(stateUpdate);
      const savedStates = stateUpdate?.args[1] as Record<string, { isTerminated?: boolean }>;
      assert.strictEqual(savedStates["sessions/no-pr"].isTerminated, false);
    });
  });

  suite("SessionTreeItem and openInWebApp", () => {
    let sandbox: sinon.SinonSandbox;
    let logChannel: vscode.OutputChannel;

    setup(() => {
      sandbox = sinon.createSandbox();
      logChannel = {
        appendLine: sandbox.stub(),
      } as unknown as vscode.OutputChannel;
    });

    teardown(() => {
      sandbox.restore();
    });

    test("SessionTreeItem should expose artifacts, command, and tooltip metadata", () => {
      updateSessionArtifactsCache("sessions/with-artifacts", [
        {
          gitPatch: { diff: "diff --git a/a.ts b/a.ts" },
          artifacts: [
            {
              changeSet: {
                files: [{ path: "src/a.ts", status: "modified" }],
              },
            },
          ],
        },
      ] as any);

      const item = new SessionTreeItem({
        name: "sessions/with-artifacts",
        title: "Artifact Session",
        state: "RUNNING",
        rawState: "IN_PROGRESS",
        automationMode: "AUTO_CREATE_PR",
        sourceContext: {
          source: "sources/github/org/repo",
          githubRepoContext: { startingBranch: "feature/test" },
        },
      } as any);

      assert.ok(item.contextValue?.includes("jules-session-with-diff"));
      assert.ok(item.contextValue?.includes("jules-session-with-changeset"));
      assert.strictEqual(item.command?.command, "jules-extension.showActivities");
      assert.ok((item.tooltip as vscode.MarkdownString).value.includes("feature/test"));
    });

    test("handleOpenInWebApp should open URLs and report missing selections", async () => {
      const openExternalStub = sandbox.stub(vscode.env, "openExternal").resolves(true);
      const warnStub = sandbox.stub(vscode.window, "showWarningMessage");
      const errorStub = sandbox.stub(vscode.window, "showErrorMessage");

      const item = new SessionTreeItem({
        name: "sessions/with-url",
        title: "Open me",
        state: "COMPLETED",
        rawState: "COMPLETED",
        url: "https://example.test/session/1",
      } as any);

      await handleOpenInWebApp(item, logChannel);
      await handleOpenInWebApp(undefined, logChannel);

      assert.strictEqual(openExternalStub.calledOnce, true);
      assert.strictEqual(errorStub.calledOnce, true);
      assert.strictEqual(warnStub.called, false);
    });
  });

  suite("createRemoteBranch", () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
      sandbox = sinon.createSandbox();

      sandbox.stub(fetchUtils, "fetchWithTimeout");
      sandbox.stub(vscode.workspace, "workspaceFolders").value([
        { name: "workspace", uri: vscode.Uri.file("/test") },
      ]);

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
      sandbox.stub(vscode.extensions, "getExtension").returns({
        activate: sandbox.stub().resolves(),
        exports: {
          getAPI: sandbox.stub().returns(gitApi),
        },
      } as any);
    });

    teardown(() => {
      sandbox.restore();
    });

    test("should create a remote branch successfully", async () => {
      (fetchUtils.fetchWithTimeout as sinon.SinonStub).resolves({
        ok: true,
        json: async () => ({ ref: "refs/heads/new-branch" }),
      } as any);

      await createRemoteBranch("token", "owner", "repo", "new-branch");

      assert.strictEqual(
        (fetchUtils.fetchWithTimeout as sinon.SinonStub).calledOnce,
        true,
      );
      assert.strictEqual(
        (fetchUtils.fetchWithTimeout as sinon.SinonStub).firstCall.args[0],
        "https://api.github.com/repos/owner/repo/git/refs",
      );
    });

    test("should surface GitHub API errors from createRemoteBranch", async () => {
      (fetchUtils.fetchWithTimeout as sinon.SinonStub).resolves({
        ok: false,
        status: 422,
        text: async () => JSON.stringify({ message: "Validation Failed" }),
      } as any);

      await assert.rejects(
        () => createRemoteBranch("token", "owner", "repo", "new-branch"),
        /GitHub API error: 422 - Validation Failed/,
      );
    });
  });

  suite("Command Registration and Execution Tests", () => {
    let localSandbox: sinon.SinonSandbox;
    let registeredCommands: Record<string, Function>;

    setup(() => {
      localSandbox = sinon.createSandbox();
      registeredCommands = {};

      const mockContext = {
        globalState: {
          get: localSandbox.stub().callsFake((key) => {
            if (key === 'selected-source') return undefined;
            return {};
          }),
          update: localSandbox.stub().resolves(),
          keys: localSandbox.stub().returns([]),
        },
        subscriptions: [],
        secrets: { get: localSandbox.stub().resolves(undefined), store: localSandbox.stub().resolves() }
      } as any as vscode.ExtensionContext;

      localSandbox.stub(vscode.window, "createTreeView").callsFake(() => ({
        onDidChangeSelection: () => ({ dispose: () => { } }),
        dispose: () => { },
      } as any));
      localSandbox.stub(vscode.window, "createStatusBarItem").returns({
        show: () => { },
        hide: () => { },
        dispose: () => { },
        name: "",
      } as any);
      localSandbox.stub(vscode.window, "createOutputChannel").returns({
        appendLine: () => { },
        clear: () => { },
        show: () => { },
        hide: () => { },
        dispose: () => { },
      } as any);
      localSandbox.stub(vscode.workspace, "getConfiguration").returns({
        get: () => undefined,
      } as any);
      localSandbox.stub(vscode.workspace, "onDidChangeConfiguration").callsFake(() => ({ dispose: () => { } } as any));

      localSandbox.stub(vscode.window, 'registerWebviewViewProvider').callsFake(() => ({ dispose: () => { } } as any));
      localSandbox.stub(vscode.languages, 'registerCodeActionsProvider').callsFake(() => ({ dispose: () => { } } as any));
      localSandbox.stub(vscode.languages, 'registerCodeLensProvider').callsFake(() => ({ dispose: () => { } } as any));
      localSandbox.stub(vscode.workspace, 'registerTextDocumentContentProvider').callsFake(() => ({ dispose: () => { } } as any));
      
      localSandbox.stub(vscode.commands, 'registerCommand').callsFake((cmd: string, cb: Function) => {
        registeredCommands[cmd] = cb;
        return { dispose: () => { } } as any;
      });

      // Require the activate function dynamically to ensure fresh registration
      const extension = require("../extension");
      extension.activate(mockContext);
    });

    teardown(() => {
      localSandbox.restore();
    });

    test("jules-extension.setApiKey executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.setApiKey']);
      
      const showInputBoxStub = localSandbox.stub(vscode.window, 'showInputBox').resolves('dummy-key');
      const showInfoStub = localSandbox.stub(vscode.window, 'showInformationMessage').resolves();

      await registeredCommands['jules-extension.setApiKey']();
      
      assert.strictEqual(showInputBoxStub.calledOnce, true);
      assert.strictEqual(showInfoStub.calledOnce, true);
    });

    test("jules-extension.refreshSessions executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.refreshSessions']);
      
      // Should run without throwing
      await registeredCommands['jules-extension.refreshSessions']();
    });

    test("jules-extension.createSession executes successfully without source", async () => {
      assert.ok(registeredCommands['jules-extension.createSession']);
      await registeredCommands['jules-extension.createSession']();
      // Test passes if it runs without throwing
    });

    test("jules-extension.verifyApiKey executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.verifyApiKey']);
      await registeredCommands['jules-extension.verifyApiKey']();
    });

    test("jules-extension.clearCache executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.clearCache']);
      const showInfoStub = localSandbox.stub(vscode.window, 'showInformationMessage').resolves();
      await registeredCommands['jules-extension.clearCache']();
      assert.strictEqual(showInfoStub.calledOnce, true);
    });

    test("jules.showFailureReason executes successfully", async () => {
      assert.ok(registeredCommands['jules.showFailureReason']);
      // If we pass an invalid item, it should return early
      await registeredCommands['jules.showFailureReason'](null);
    });

    test("jules-extension.openInWebApp executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.openInWebApp']);
      await registeredCommands['jules-extension.openInWebApp'](null);
    });

    test("jules-extension.deleteSession executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.deleteSession']);
      await registeredCommands['jules-extension.deleteSession'](null);
    });

    test("jules-extension.checkoutToBranch executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.checkoutToBranch']);
      await registeredCommands['jules-extension.checkoutToBranch'](null);
    });

    test("jules-extension.openLatestDiff executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.openLatestDiff']);
      await registeredCommands['jules-extension.openLatestDiff'](null);
    });

    test("jules-extension.openChangeset executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.openChangeset']);
      await registeredCommands['jules-extension.openChangeset'](null);
    });

    test("jules-extension.applyPatchLocally executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.applyPatchLocally']);
      await registeredCommands['jules-extension.applyPatchLocally'](null);
    });

    test("jules-extension.reviewPlan executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.reviewPlan']);
      await registeredCommands['jules-extension.reviewPlan'](null);
    });

    test("jules-extension.approvePlan executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.approvePlan']);
      await registeredCommands['jules-extension.approvePlan'](null);
    });

    test("jules-extension.sendMessage executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.sendMessage']);
      await registeredCommands['jules-extension.sendMessage'](null);
    });

    test("jules.filterActivities executes successfully", async () => {
      assert.ok(registeredCommands['jules.filterActivities']);
      await registeredCommands['jules.filterActivities']();
    });

    test("jules-extension.showActivities executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.showActivities']);
      await registeredCommands['jules-extension.showActivities'](null);
    });

    test("jules-extension.refreshActivities executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.refreshActivities']);
      await registeredCommands['jules-extension.refreshActivities'](null);
    });

    test("jules-extension.listSources executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.listSources']);
      await registeredCommands['jules-extension.listSources']();
    });

    test("jules-extension.openSettings executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.openSettings']);
      await registeredCommands['jules-extension.openSettings']();
    });

    test("jules-extension.openPRInBrowser executes successfully", async () => {
      assert.ok(registeredCommands['jules-extension.openPRInBrowser']);
      await registeredCommands['jules-extension.openPRInBrowser'](null);
    });
  });

  suite("Exported helper functions", () => {
    test("mapApiStateToSessionState handles all states", () => {
      assert.strictEqual(mapApiStateToSessionState("IN_PROGRESS"), "RUNNING");
      assert.strictEqual(mapApiStateToSessionState("QUEUED"), "RUNNING");
      assert.strictEqual(mapApiStateToSessionState("STATE_UNSPECIFIED"), "RUNNING");
      assert.strictEqual(mapApiStateToSessionState("PLANNING"), "PLANNING");
      assert.strictEqual(mapApiStateToSessionState("AWAITING_PLAN_APPROVAL"), "AWAITING_PLAN_APPROVAL");
      assert.strictEqual(mapApiStateToSessionState("AWAITING_USER_FEEDBACK"), "AWAITING_USER_FEEDBACK");
      assert.strictEqual(mapApiStateToSessionState("PAUSED"), "PAUSED");
      assert.strictEqual(mapApiStateToSessionState("COMPLETED"), "COMPLETED");
      assert.strictEqual(mapApiStateToSessionState("FAILED"), "FAILED");
      assert.strictEqual(mapApiStateToSessionState("CANCELLED"), "CANCELLED");
      assert.strictEqual(mapApiStateToSessionState("UNKNOWN"), "RUNNING");
    });

    test("extractPRs deduplicates PR URLs", () => {
      const state = {
        outputs: [
          { pullRequest: { url: "https://github.com/a/b/pull/1" } },
          { pullRequest: { url: "https://github.com/a/b/pull/1" } },
          { pullRequest: { url: "https://github.com/a/b/pull/2" } }
        ]
      } as any as Session;
      const prs = extractPRs(state);
      assert.strictEqual(prs.length, 2);
      assert.strictEqual(prs[0].url, "https://github.com/a/b/pull/1");
      assert.strictEqual(prs[1].url, "https://github.com/a/b/pull/2");
    });

    test("extractPRs handles empty outputs", () => {
      assert.deepStrictEqual(extractPRs({} as any as Session), []);
      assert.deepStrictEqual(extractPRs({ outputs: [] } as any as Session), []);
    });

    test("areOutputsEqual compares outputs correctly", () => {
      assert.strictEqual(areOutputsEqual(undefined, undefined), true);
      assert.strictEqual(areOutputsEqual([], []), true);
      assert.strictEqual(areOutputsEqual([{pullRequest: {url: "a"}} as any], [{pullRequest: {url: "a"}} as any]), true);
      assert.strictEqual(areOutputsEqual([{pullRequest: {url: "a"}} as any], [{pullRequest: {url: "b"}} as any]), false);
      assert.strictEqual(areOutputsEqual([{pullRequest: {url: "a"}} as any], []), false);
      assert.strictEqual(areOutputsEqual(undefined, []), false);
    });

    test("areSessionListsEqual compares sessions correctly", () => {
      const s1 = { name: "1", state: "RUNNING", rawState: "IN_PROGRESS", outputs: [], sourceContext: {} } as any as Session;
      const s2 = { name: "2", state: "RUNNING", rawState: "IN_PROGRESS", outputs: [], sourceContext: {} } as any as Session;
      const s1_diff = { name: "1", state: "FAILED", rawState: "ERROR", outputs: [], sourceContext: {} } as any as Session;

      assert.strictEqual(areSessionListsEqual([], []), true);
      assert.strictEqual(areSessionListsEqual([s1], [s1]), true);
      assert.strictEqual(areSessionListsEqual([s1], [s2]), false);
      assert.strictEqual(areSessionListsEqual([s1], []), false);
      assert.strictEqual(areSessionListsEqual([s1], [s1_diff]), false);
    });

    test("isInferredActivityLogKey correctly identifies keys", () => {
      assert.strictEqual(isInferredActivityLogKey("someInferredKey"), true);
      assert.strictEqual(isInferredActivityLogKey("name"), false);
      assert.strictEqual(isInferredActivityLogKey("createTime"), false);
    });

    test("getSourceIsPrivate correctly identifies private sources", () => {
      assert.strictEqual(getSourceIsPrivate({ name: "A", id: "1", isPrivate: true } as any), true);
      assert.strictEqual(getSourceIsPrivate({ name: "A", id: "1", isPrivate: false } as any), false);
      assert.strictEqual(getSourceIsPrivate({ name: "A", id: "1", githubRepo: { owner: "A", repo: "B", isPrivate: true, defaultBranch: { displayName: "main" }, branches: [] } } as any), true);
      assert.strictEqual(getSourceIsPrivate({ name: "A", id: "1" } as any), undefined);
    });

    test("getSourceDisplayName formats source names", () => {
      assert.strictEqual(getSourceDisplayName({ name: "A", id: "1" } as any), "A");
      assert.strictEqual(getSourceDisplayName({ name: "A", id: "1", githubRepo: { owner: "owner", repo: "repo", isPrivate: false, defaultBranch: { displayName: "main" }, branches: [] } } as any), "owner/repo");
    });

    test("buildSessionsListEndpoint constructs URL correctly", () => {
      assert.strictEqual(buildSessionsListEndpoint("src", "token"), "src/sessions?pageSize=100&pageToken=token");
      assert.strictEqual(buildSessionsListEndpoint("src"), "src/sessions?pageSize=100");
    });

    test("buildActivitiesListEndpoint constructs URL correctly", () => {
      assert.strictEqual(buildActivitiesListEndpoint("sess", "10", { pageToken: "token" }), "sess/10/activities?pageSize=100&pageToken=token");
      assert.strictEqual(buildActivitiesListEndpoint("sess", "10"), "sess/10/activities?pageSize=100");
    });

    test("getLatestActivityCreateTime gets the latest time", () => {
      assert.strictEqual(getLatestActivityCreateTime([]), undefined);
      assert.strictEqual(getLatestActivityCreateTime([{ id: "1", name: "1", createTime: "2023-01-01T00:00:00Z" } as any]), "2023-01-01T00:00:00Z");
      assert.strictEqual(getLatestActivityCreateTime([{ id: "1", name: "1", createTime: "2023-01-01T00:00:00Z" } as any, { id: "2", name: "2", createTime: "2024-01-01T00:00:00Z" } as any]), "2024-01-01T00:00:00Z");
      assert.strictEqual(getLatestActivityCreateTime([{ id: "1", name: "1", createTime: "2025-01-01T00:00:00Z" } as any, { id: "2", name: "2", createTime: "2024-01-01T00:00:00Z" } as any]), "2025-01-01T00:00:00Z");
    });

    test("mergeActivitiesByIdentity merges activities", () => {
      const a1 = { id: "1", name: "1", createTime: "2023-01-01", type: "T1" } as any as Activity;
      const a2 = { id: "2", name: "2", createTime: "2023-01-02", type: "T2" } as any as Activity;
      const a1_updated = { id: "1", name: "1", createTime: "2023-01-01", type: "T1_UPDATED" } as any as Activity;

      assert.deepStrictEqual(mergeActivitiesByIdentity([a1], []), [a1]);
      assert.deepStrictEqual(mergeActivitiesByIdentity([], [a2]), [a2]);
      assert.deepStrictEqual(mergeActivitiesByIdentity([a1], [a1_updated]), [a1_updated]);
      const merged = mergeActivitiesByIdentity([a1], [a2, a1_updated]);
      assert.strictEqual(merged.length, 2);
    });

    test("buildActivitySummaryHeader creates summary", () => {
      const activities = [
        { id: "1", originator: "agent", planGenerated: {}, name: "1", createTime: "" } as any as Activity,
        { id: "2", originator: "user", userMessaged: {}, name: "2", createTime: "" } as any as Activity,
      ];
      const summary = buildActivitySummaryHeader("RUNNING", activities);
      assert.ok(summary.includes("Activities: 2"));
      assert.ok(summary.includes("Plan: 1"));
      assert.ok(summary.includes("Messages: 1"));
    });
  });
});
