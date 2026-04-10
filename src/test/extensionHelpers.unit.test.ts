import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
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
  mapApiStateToSessionState,
  mergeActivitiesByIdentity,
  resetUpdatePreviousStatesCachesForTests,
  updatePreviousStates,
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
        .find((call) => call.args[0] === "jules.previousSessionStates");
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
        .find((call) => call.args[0] === "jules.previousSessionStates");
      assert.ok(stateUpdate);
      const savedStates = stateUpdate?.args[1] as Record<
        string,
        { isTerminated?: boolean }
      >;
      assert.strictEqual(savedStates["sessions/pr-status-closed-1"].isTerminated, true);
      assert.strictEqual(savedStates["sessions/pr-status-closed-2"].isTerminated, true);
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
});
