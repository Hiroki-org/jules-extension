import * as assert from "assert";
import * as sinon from "sinon";
import { JulesSessionsProvider } from "../extension";
import * as artifacts from "../sessionArtifacts";
import * as vscode from "vscode";

suite("extension prefetch artifacts code coverage", () => {
  let provider: any; // We access private methods for coverage testing
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create a mock context
    const mockContext = {
      globalState: {
        get: sandbox.stub(),
        update: sandbox.stub().resolves(),
      },
      secrets: {
        get: sandbox.stub(),
        store: sandbox.stub().resolves(),
        delete: sandbox.stub().resolves(),
        onDidChange: sandbox.stub(),
      },
      extensionUri: vscode.Uri.file("/tmp/mock/extension"),
      workspaceState: {
        get: sandbox.stub(),
        update: sandbox.stub().resolves(),
      },
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    provider = new JulesSessionsProvider(mockContext);

    // Reset throttle time to 0 to bypass the prefetch throttle
    provider.lastArtifactsPrefetchTime = 0;
  });

  teardown(() => {
    sandbox.restore();
  });

  test("should handle rejected promises and logging", async () => {
    // Stub fetchLatestSessionArtifacts to reject
    sandbox.stub(artifacts, "fetchLatestSessionArtifacts").rejects(new Error("mock error"));
    sandbox.stub(artifacts, "getCachedSessionArtifacts").returns(undefined);

    const consoleErrorStub = sandbox.stub(console, "error");

    // mock sessions
    const sessions = [
      { name: "sessions/123", updateTime: "time1" }
    ];

    await provider._prefetchArtifactsForRecentSessions("api-key", sessions);

    assert.ok(consoleErrorStub.calledOnce);
    assert.ok(consoleErrorStub.firstCall.args[0].includes("mock error"));
  });

  test("should handle fulfilled promises and fire onDidChangeTreeData", async () => {
    // We want hadDiff !== hasDiff to trigger the tree refresh
    // So before has no diff, after has diff

    let callCount = 0;
    sandbox.stub(artifacts, "getCachedSessionArtifacts").callsFake(() => {
      callCount++;
      if (callCount === 1) { // before
        return { latestDiff: null, latestChangeSet: null } as any;
      }
      return { latestDiff: "some-diff", latestChangeSet: null } as any; // after
    });

    sandbox.stub(artifacts, "fetchLatestSessionArtifacts").resolves();

    let fired = false;
    provider._onDidChangeTreeData = {
      fire: () => { fired = true; }
    };

    const consoleLogStub = sandbox.stub(console, "log");

    const sessions = [
      { name: "sessions/123", updateTime: "time1" }
    ];

    await provider._prefetchArtifactsForRecentSessions("api-key", sessions);

    assert.ok(fired);
    assert.ok(consoleLogStub.calledWithMatch(/triggering tree refresh/));
  });
});
