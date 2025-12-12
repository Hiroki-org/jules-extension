import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { GitHubAuth } from '../githubAuth';

suite('GitHubAuth Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let getSessionStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

    const FAKE_SESSION = {
        accessToken: 'fake-token',
        account: { label: 'testuser', id: '1' },
        id: 's1',
        scopes: []
    };

    setup(() => {
        sandbox = sinon.createSandbox();
        getSessionStub = sandbox.stub(vscode.authentication, 'getSession');
        showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
    });

    teardown(() => {
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
            const args = getSessionStub.firstCall.args;
            assert.deepStrictEqual(args[2], { createIfNone: false });
        });

        test('should return undefined when error occurs', async () => {
            getSessionStub.rejects(new Error('Error'));

            const session = await GitHubAuth.getSession();

            assert.strictEqual(session, undefined);
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
