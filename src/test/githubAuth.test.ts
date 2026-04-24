import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { GitHubAuth } from '../githubAuth';

suite('GitHubAuth Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let getSessionStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let onDidChangeSessionsStub: sinon.SinonStub;
    let onDidChangeSessionsListener: ((event: unknown) => void) | undefined;

    const FAKE_SESSION = {
        accessToken: 'fake-token',
        account: { label: 'testuser', id: '1' },
        id: 's1',
        scopes: []
    };

    setup(() => {
        GitHubAuth.dispose();
        sandbox = sinon.createSandbox();
        getSessionStub = sandbox.stub(vscode.authentication, 'getSession');
        onDidChangeSessionsStub = sandbox.stub(
            (vscode.authentication as unknown as { onDidChangeSessions: (listener: (event: unknown) => void) => vscode.Disposable }),
            'onDidChangeSessions'
        );
        onDidChangeSessionsStub.callsFake((listener: (event: unknown) => void) => {
            onDidChangeSessionsListener = listener;
            return { dispose: () => undefined };
        });
        GitHubAuth.clearCache();
        showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
    });

    teardown(() => {
        GitHubAuth.dispose();
        sandbox.restore();
    });

    suite('signIn', () => {
        test('should return access token on successful sign in', async () => {
            getSessionStub.resolves(FAKE_SESSION);

            const token = await GitHubAuth.signIn();

            assert.strictEqual(token, 'fake-token');
            assert.strictEqual(getSessionStub.calledOnce, true);
            const args = getSessionStub.firstCall.args;
            assert.strictEqual(args[0], 'github');
            assert.deepStrictEqual(args[1], ['repo']);
            assert.deepStrictEqual(args[2], { createIfNone: true });
        });

        test('should return undefined and show error on failure', async () => {
            getSessionStub.rejects(new Error('Auth failed'));

            const token = await GitHubAuth.signIn();

            assert.strictEqual(token, undefined);
            assert.strictEqual(showErrorMessageStub.calledOnce, true);
        });
    });

    suite('getSession', () => {
        test('should return session when available', async () => {
            getSessionStub.resolves(FAKE_SESSION);

            const session = await GitHubAuth.getSession();

            assert.strictEqual(session, FAKE_SESSION);
            assert.strictEqual(getSessionStub.calledOnce, true);
            const args = getSessionStub.firstCall?.args;
            assert.deepStrictEqual(args?.[2], { createIfNone: false });
        });

        test('should return undefined when error occurs', async () => {
            getSessionStub.rejects(new Error('Error'));

            const session = await GitHubAuth.getSession();

            assert.strictEqual(session, undefined);
        });

        test('should dedupe concurrent session fetches', async () => {
            let resolveSession: ((value: typeof FAKE_SESSION | undefined) => void) | undefined;
            const pendingSession = new Promise<typeof FAKE_SESSION | undefined>((resolve) => {
                resolveSession = resolve;
            });
            getSessionStub.onFirstCall().returns(pendingSession);

            const p1 = GitHubAuth.getToken();
            const p2 = GitHubAuth.getToken();

            assert.strictEqual(getSessionStub.calledOnce, true);
            resolveSession?.(FAKE_SESSION);

            const [token1, token2] = await Promise.all([p1, p2]);
            assert.strictEqual(token1, 'fake-token');
            assert.strictEqual(token2, 'fake-token');
        });

        test('should clear cache when GitHub sessions change', async () => {
            const refreshedSession = {
                ...FAKE_SESSION,
                accessToken: 'new-token',
                id: 's2'
            };
            getSessionStub.onFirstCall().resolves(FAKE_SESSION);
            getSessionStub.onSecondCall().resolves(refreshedSession);

            const first = await GitHubAuth.getSession();
            assert.strictEqual(first?.accessToken, 'fake-token');
            assert.strictEqual(getSessionStub.calledOnce, true);

            onDidChangeSessionsListener?.({ provider: { id: 'github' } });

            const second = await GitHubAuth.getSession();
            assert.strictEqual(second?.accessToken, 'new-token');
            assert.strictEqual(getSessionStub.calledTwice, true);
        });
    });

    suite('getToken', () => {
        test('should return token when session exists', async () => {
            getSessionStub.resolves(FAKE_SESSION);

            const token = await GitHubAuth.getToken();

            assert.strictEqual(token, 'fake-token');
        });

        test('should return undefined when session is missing', async () => {
            getSessionStub.resolves(undefined);

            const token = await GitHubAuth.getToken();

            assert.strictEqual(token, undefined);
        });
    });

    suite('getUserInfo', () => {
        test('should return user info when session exists', async () => {
            getSessionStub.resolves(FAKE_SESSION);

            const info = await GitHubAuth.getUserInfo();

            assert.deepStrictEqual(info, { login: 'testuser', name: 'testuser' });
        });

        test('should return undefined when session is missing', async () => {
            getSessionStub.resolves(undefined);

            const info = await GitHubAuth.getUserInfo();

            assert.strictEqual(info, undefined);
        });
    });

    suite('isSignedIn', () => {
        test('should return true when session exists', async () => {
            getSessionStub.resolves(FAKE_SESSION);
            const signedIn = await GitHubAuth.isSignedIn();
            assert.strictEqual(signedIn, true);
        });

        test('should return false when session is missing', async () => {
            getSessionStub.resolves(undefined);
            const signedIn = await GitHubAuth.isSignedIn();
            assert.strictEqual(signedIn, false);
        });
    });
});
