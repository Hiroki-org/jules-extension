import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { GitHubAuth } from "../githubAuth";

suite("GitHubAuth Unit Test Suite", () => {
  let sandbox: sinon.SinonSandbox;
  let getSessionStub: sinon.SinonStub;
  let onDidChangeSessionsStub: sinon.SinonStub;
  let onDidChangeSessionsListener: ((event: unknown) => void) | undefined;

  const fakeSession = {
    accessToken: "fake-token",
    account: { label: "testuser", id: "1" },
    id: "session-1",
    scopes: [],
  };

  setup(() => {
    sandbox = sinon.createSandbox();
    getSessionStub = sandbox.stub((vscode as any).authentication, "getSession");
    onDidChangeSessionsStub = sandbox.stub(
      (vscode as any).authentication,
      "onDidChangeSessions",
    );
    onDidChangeSessionsStub.callsFake((listener: (event: unknown) => void) => {
      onDidChangeSessionsListener = listener;
      return { dispose: () => undefined };
    });
    GitHubAuth.clearCache();
    sandbox.stub(vscode.window, "showErrorMessage");
  });

  teardown(() => {
    sandbox.restore();
  });

  test("signIn should request a session and return the access token", async () => {
    getSessionStub.resolves(fakeSession);

    const token = await GitHubAuth.signIn();

    assert.strictEqual(token, "fake-token");
    assert.strictEqual(getSessionStub.calledOnce, true);
    assert.deepStrictEqual(getSessionStub.firstCall.args, [
      "github",
      ["repo"],
      { createIfNone: true },
    ]);
  });

  test("signIn should show an error and return undefined on failure", async () => {
    getSessionStub.rejects(new Error("Auth failed"));

    const token = await GitHubAuth.signIn();

    assert.strictEqual(token, undefined);
    assert.strictEqual(
      (vscode.window.showErrorMessage as sinon.SinonStub).calledOnce,
      true,
    );
  });

  test("getSession should request a non-creating session", async () => {
    getSessionStub.resolves(fakeSession);

    const session = await GitHubAuth.getSession();

    assert.strictEqual(session, fakeSession);
    assert.deepStrictEqual(getSessionStub.firstCall?.args, [
      "github",
      ["repo"],
      { createIfNone: false },
    ]);
  });

  test("getSession should dedupe concurrent session fetches", async () => {
    let resolveSession: ((value: typeof fakeSession | undefined) => void) | undefined;
    const pendingSession = new Promise<typeof fakeSession | undefined>((resolve) => {
      resolveSession = resolve;
    });
    getSessionStub.onFirstCall().returns(pendingSession);

    const p1 = GitHubAuth.getToken();
    const p2 = GitHubAuth.getToken();

    assert.strictEqual(getSessionStub.calledOnce, true);
    resolveSession?.(fakeSession);

    const [token1, token2] = await Promise.all([p1, p2]);
    assert.strictEqual(token1, "fake-token");
    assert.strictEqual(token2, "fake-token");
  });

  test("getSession should clear cache when GitHub sessions change", async () => {
    const refreshedSession = {
      ...fakeSession,
      accessToken: "new-token",
      id: "session-2",
    };
    getSessionStub.onFirstCall().resolves(fakeSession);
    getSessionStub.onSecondCall().resolves(refreshedSession);

    const first = await GitHubAuth.getSession();
    assert.strictEqual(first?.accessToken, "fake-token");
    assert.strictEqual(getSessionStub.calledOnce, true);

    onDidChangeSessionsListener?.({ provider: { id: "github" } });

    const second = await GitHubAuth.getSession();
    assert.strictEqual(second?.accessToken, "new-token");
    assert.strictEqual(getSessionStub.calledTwice, true);
  });

  test("getToken should return undefined when no session exists", async () => {
    getSessionStub.resolves(undefined);

    const token = await GitHubAuth.getToken();

    assert.strictEqual(token, undefined);
  });

  test("getUserInfo and isSignedIn should reflect the active session", async () => {
    getSessionStub.resolves(fakeSession);

    const info = await GitHubAuth.getUserInfo();
    const signedIn = await GitHubAuth.isSignedIn();

    assert.deepStrictEqual(info, { login: "testuser", name: "testuser" });
    assert.strictEqual(signedIn, true);
  });
});
