import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { GitHubAuth } from "../githubAuth";

suite("GitHubAuth Unit Test Suite", () => {
  let sandbox: sinon.SinonSandbox;
  let getSessionStub: sinon.SinonStub;
  let onDidChangeSessionsStub: sinon.SinonStub;
  let onDidChangeSessionsListener: ((event: unknown) => void) | undefined;
  let listenerDisposeSpy: sinon.SinonSpy;

  const resetGitHubAuthState = () => {
    const authState = GitHubAuth as unknown as {
      authChangeListenerDisposable?: { dispose?: () => void };
      cachedSession?: vscode.AuthenticationSession;
      sessionExpiry?: number;
      pendingSessionPromise?: Promise<vscode.AuthenticationSession | undefined>;
      sessionRequestVersion?: number;
    };

    authState.authChangeListenerDisposable?.dispose?.();
    authState.authChangeListenerDisposable = undefined;
    authState.cachedSession = undefined;
    authState.sessionExpiry = 0;
    authState.pendingSessionPromise = undefined;
    authState.sessionRequestVersion = 0;
  };

  const fakeSession = {
    accessToken: "fake-token",
    account: { label: "testuser", id: "1" },
    id: "session-1",
    scopes: [],
  };

  setup(() => {
    GitHubAuth.dispose();
    sandbox = sinon.createSandbox();
    onDidChangeSessionsListener = undefined;
    getSessionStub = sandbox.stub((vscode as any).authentication, "getSession");
    onDidChangeSessionsStub = sandbox.stub(
      (vscode as any).authentication,
      "onDidChangeSessions",
    );
    onDidChangeSessionsStub.callsFake((listener: (event: unknown) => void) => {
      onDidChangeSessionsListener = listener;
      listenerDisposeSpy = sandbox.spy();
      return { dispose: listenerDisposeSpy };
    });
    sandbox.stub(vscode.window, "showErrorMessage");
  });

  teardown(() => {
    GitHubAuth.dispose();
    onDidChangeSessionsListener = undefined;
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

  test("signIn should ignore stale session for cache after cache clear", async () => {
    const refreshedSession = {
      ...fakeSession,
      accessToken: "fresh-token",
      id: "session-2",
    };
    let resolveSignInSession:
      | ((value: typeof fakeSession | undefined) => void)
      | undefined;
    const pendingSignInSession = new Promise<typeof fakeSession | undefined>(
      (resolve) => {
        resolveSignInSession = resolve;
      },
    );

    getSessionStub.onFirstCall().returns(pendingSignInSession);
    getSessionStub.onSecondCall().resolves(refreshedSession);

    const signInPromise = GitHubAuth.signIn();
    GitHubAuth.clearCache();
    resolveSignInSession?.(fakeSession);

    await signInPromise;

    const session = await GitHubAuth.getSession();
    assert.strictEqual(session?.accessToken, "fresh-token");
    assert.strictEqual(getSessionStub.calledTwice, true);
    assert.deepStrictEqual(getSessionStub.secondCall.args, [
      "github",
      ["repo"],
      { createIfNone: false },
    ]);
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

  test("getSession should return undefined when the request fails", async () => {
    getSessionStub.rejects(new Error("Auth failed"));

    const session = await GitHubAuth.getSession();

    assert.strictEqual(session, undefined);
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

  test("getSession should ignore stale results after cache clear", async () => {
    let resolveSession: ((value: typeof fakeSession | undefined) => void) | undefined;
    const pendingSession = new Promise<typeof fakeSession | undefined>((resolve) => {
      resolveSession = resolve;
    });
    getSessionStub.onFirstCall().returns(pendingSession);
    getSessionStub.onSecondCall().resolves(fakeSession);

    const pendingRequest = GitHubAuth.getSession();
    GitHubAuth.clearCache();
    resolveSession?.(fakeSession);

    const staleSession = await pendingRequest;
    assert.strictEqual(staleSession, undefined);

    const freshSession = await GitHubAuth.getSession();
    assert.strictEqual(freshSession, fakeSession);
    assert.strictEqual(getSessionStub.calledTwice, true);
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

    GitHubAuth.handleAuthChange({ provider: { id: "github" } });

    const second = await GitHubAuth.getSession();
    assert.strictEqual(second?.accessToken, "new-token");
    assert.strictEqual(getSessionStub.calledTwice, true);
  });

  test("getSession should ignore auth change events for other providers or missing providers", async () => {
    getSessionStub.resolves(fakeSession);

    const session = await GitHubAuth.getSession();
    assert.strictEqual(session, fakeSession);

    GitHubAuth.handleAuthChange({ provider: { id: "azure" } });

    let cachedSession = await GitHubAuth.getSession();
    assert.strictEqual(cachedSession, fakeSession);
    assert.strictEqual(getSessionStub.calledOnce, true);

    GitHubAuth.handleAuthChange({});

    cachedSession = await GitHubAuth.getSession();
    assert.strictEqual(cachedSession, fakeSession);
    assert.strictEqual(getSessionStub.calledOnce, true);
    assert.strictEqual(listenerDisposeSpy?.calledOnce ?? false, false);
  });

  test("getToken should return cached token if fresh", async () => {
    getSessionStub.resolves(fakeSession);
    await GitHubAuth.getSession(); // populate cache
    getSessionStub.resetHistory();
    const token = await GitHubAuth.getToken();
    assert.strictEqual(token, "fake-token");
    assert.strictEqual(getSessionStub.called, false);
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
