import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as sessionContextMenu from '../sessionContextMenu';
import { GitHubAuth } from '../githubAuth';
import * as githubUtils from '../githubUtils';
import type { Session } from '../types';
import type { PullRequestBranchInfo } from '../githubUtils';

suite('sessionContextMenu checkout coverage suite', () => {
    let sandbox: sinon.SinonSandbox;
    let getExtensionStub: sinon.SinonStub;
    let showQuickPickStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let openExternalStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        getExtensionStub = sandbox.stub(vscode.extensions, 'getExtension');
        showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick');
        showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
        showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
        showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage');
        openExternalStub = sandbox.stub(vscode.env, 'openExternal');
    });

    teardown(() => {
        sandbox.restore();
    });

    function createOutputChannel() {
        return {
            appendLine: sandbox.stub(),
            append: sandbox.stub(),
            clear: sandbox.stub(),
            replace: sandbox.stub(),
            dispose: sandbox.stub(),
            show: sandbox.stub(),
            hide: sandbox.stub(),
            name: 'test'
        } as unknown as vscode.OutputChannel;
    }

    function createRepository(overrides: Record<string, unknown> = {}) {
        return {
            rootUri: vscode.Uri.file('/repo'),
            state: {
                HEAD: { name: 'main' },
                workingTreeChanges: [],
                indexChanges: [],
                remotes: []
            },
            checkout: sandbox.stub().resolves(),
            fetch: sandbox.stub().resolves(),
            addRemote: sandbox.stub().resolves(),
            createBranch: sandbox.stub().resolves(),
            stash: sandbox.stub().resolves(),
            ...overrides
        } as any;
    }

    function stubGitExtension(repositories: any[]) {
        const getAPI = sandbox.stub().withArgs(1).returns({ repositories });
        const activate = sandbox.stub().resolves();
        getExtensionStub.withArgs('vscode.git').returns({ activate, exports: { getAPI } } as any);
        return { activate, getAPI };
    }

    test('selectRepository returns the only repository without prompting', async () => {
        const repo = createRepository();
        const result = await sessionContextMenu.selectRepository([repo], () => undefined);

        assert.strictEqual(result, repo);
        assert.strictEqual(showQuickPickStub.called, false);
    });

    test('selectRepository returns null when multi-root selection is cancelled', async () => {
        const repo1 = createRepository({ rootUri: vscode.Uri.file('/repo-a') });
        const repo2 = createRepository({ rootUri: vscode.Uri.file('/repo-b') });
        showQuickPickStub.resolves(undefined);

        const result = await sessionContextMenu.selectRepository([repo1, repo2], () => undefined);

        assert.strictEqual(result, null);
        assert.strictEqual(showQuickPickStub.calledOnce, true);
    });

    test('selectRepository returns the chosen repository in multi-root workspaces', async () => {
        const repo1 = createRepository({ rootUri: vscode.Uri.file('/repo-a') });
        const repo2 = createRepository({ rootUri: vscode.Uri.file('/repo-b') });
        showQuickPickStub.resolves({ repo: repo2 });

        const result = await sessionContextMenu.selectRepository([repo1, repo2], () => undefined);

        assert.strictEqual(result, repo2);
    });

    test('handleUncommittedChanges returns true when repository is clean', async () => {
        const result = await sessionContextMenu.handleUncommittedChanges(createRepository(), 'feature/test', () => undefined);

        assert.strictEqual(result, true);
        assert.strictEqual(showWarningMessageStub.called, false);
    });

    test('handleUncommittedChanges returns false when user cancels', async () => {
        const repo = createRepository({
            state: {
                HEAD: { name: 'main' },
                workingTreeChanges: [{ path: 'file.ts' }],
                indexChanges: [],
                remotes: []
            }
        });
        showWarningMessageStub.resolves(undefined);

        const result = await sessionContextMenu.handleUncommittedChanges(repo, 'feature/test', () => undefined);

        assert.strictEqual(result, false);
        assert.strictEqual(showWarningMessageStub.calledOnce, true);
    });

    test('handleUncommittedChanges stashes and proceeds when user selects stash', async () => {
        const repo = createRepository({
            state: {
                HEAD: { name: 'main' },
                workingTreeChanges: [{ path: 'file.ts' }],
                indexChanges: [],
                remotes: []
            }
        });
        showWarningMessageStub.resolves('Stash Changes & Checkout');

        const result = await sessionContextMenu.handleUncommittedChanges(repo, 'feature/test', () => undefined);

        assert.strictEqual(result, true);
        assert.strictEqual((repo.stash as sinon.SinonStub).calledOnce, true);
    });

    test('handleUncommittedChanges returns false when stash fails', async () => {
        const repo = createRepository({
            stash: sandbox.stub().rejects(new Error('stash failed')),
            state: {
                HEAD: { name: 'main' },
                workingTreeChanges: [{ path: 'file.ts' }],
                indexChanges: [],
                remotes: []
            }
        });
        showWarningMessageStub.resolves('Stash Changes & Checkout');

        const result = await sessionContextMenu.handleUncommittedChanges(repo, 'feature/test', () => undefined);

        assert.strictEqual(result, false);
        assert.strictEqual(showErrorMessageStub.calledOnce, true);
    });

    test('checkoutToBranch returns false when the Git extension is unavailable', async () => {
        getExtensionStub.withArgs('vscode.git').returns(undefined);

        const result = await sessionContextMenu.checkoutToBranch('feature/test', createOutputChannel());

        assert.strictEqual(result, false);
        assert.strictEqual(showErrorMessageStub.calledOnce, true);
    });

    test('checkoutToBranch returns false when checkout is cancelled by repository selection', async () => {
        stubGitExtension([createRepository(), createRepository({ rootUri: vscode.Uri.file('/repo-b') })]);
        showQuickPickStub.resolves(undefined);

        const result = await sessionContextMenu.checkoutToBranch('feature/test', createOutputChannel());

        assert.strictEqual(result, false);
    });

    test('checkoutToBranch performs a successful checkout when repository is clean', async () => {
        const repo = createRepository();
        stubGitExtension([repo]);

        const result = await sessionContextMenu.checkoutToBranch('feature/test', createOutputChannel());

        assert.strictEqual(result, true);
        assert.strictEqual((repo.checkout as sinon.SinonStub).calledWithExactly('feature/test'), true);
    });

    test('checkoutToBranch falls back to fetch and checkout when the branch is missing locally', async () => {
        const repo = createRepository({
            checkout: sandbox.stub()
                .onFirstCall().rejects(new Error('pathspec did not match any file(s) known to git'))
                .onSecondCall().resolves()
        });
        stubGitExtension([repo]);
        showInformationMessageStub.resolves('Fetch & Checkout');

        const result = await sessionContextMenu.checkoutToBranch('feature/test', createOutputChannel());

        assert.strictEqual(result, true);
        assert.strictEqual((repo.fetch as sinon.SinonStub).calledOnce, true);
        assert.strictEqual((repo.checkout as sinon.SinonStub).callCount, 2);
    });

    test('checkoutToBranch returns false when fetch fallback is cancelled', async () => {
        const repo = createRepository({
            checkout: sandbox.stub().rejects(new Error('branch not found'))
        });
        stubGitExtension([repo]);
        showInformationMessageStub.resolves('Cancel');

        const result = await sessionContextMenu.checkoutToBranch('feature/test', createOutputChannel());

        assert.strictEqual(result, false);
        assert.strictEqual((repo.fetch as sinon.SinonStub).called, false);
    });

    test('checkoutToBranch returns false for non-repository checkout failures', async () => {
        const repo = createRepository({
            checkout: sandbox.stub().rejects(new Error('permission denied'))
        });
        stubGitExtension([repo]);

        const result = await sessionContextMenu.checkoutToBranch('feature/test', createOutputChannel());

        assert.strictEqual(result, false);
        assert.strictEqual((repo.fetch as sinon.SinonStub).called, false);
    });

    test('fetchBranchInfoFromPR returns null when no PR URL is available', async () => {
        const session: Partial<Session> = { name: 'session-1', title: 'Session 1' };

        const result = await sessionContextMenu.fetchBranchInfoFromPR(session as Session, createOutputChannel());

        assert.strictEqual(result, null);
    });

    test('fetchBranchInfoFromPR returns null when token is unavailable', async () => {
        const session: Partial<Session> = {
            name: 'session-2',
            title: 'Session 2',
            outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/123' } } as any]
        };
        sandbox.stub(GitHubAuth, 'getToken').resolves(undefined);

        const result = await sessionContextMenu.fetchBranchInfoFromPR(session as Session, createOutputChannel());

        assert.strictEqual(result, null);
    });

    test('fetchBranchInfoFromPR returns branch info when API call succeeds', async () => {
        const session: Partial<Session> = {
            name: 'session-3',
            title: 'Session 3',
            outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/123' } } as any]
        };
        const branchInfo: PullRequestBranchInfo = {
            headBranch: 'feature/pr-123',
            baseBranch: 'main',
            headOwner: 'fork-owner',
            headRepo: 'fork-repo',
            headCloneUrl: 'https://github.com/fork-owner/fork-repo.git',
            state: 'open',
            title: 'Test PR'
        };
        sandbox.stub(GitHubAuth, 'getToken').resolves('token');
        sandbox.stub(githubUtils, 'getPullRequestBranchInfo').resolves(branchInfo);

        const result = await sessionContextMenu.fetchBranchInfoFromPR(session as Session, createOutputChannel());

        assert.deepStrictEqual(result, branchInfo);
        assert.strictEqual((githubUtils.getPullRequestBranchInfo as sinon.SinonStub).calledOnceWithExactly('token', 'owner', 'repo', 123), true);
    });

    test('checkoutToBranchForSession falls back to the session branch when GitHub API is unavailable', async () => {
        const repo = createRepository();
        stubGitExtension([repo]);
        sandbox.stub(GitHubAuth, 'getToken').resolves(undefined);
        const session: Partial<Session> = {
            name: 'session-4',
            title: 'Session 4',
            outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/123' } } as any],
            sourceContext: {
                githubRepoContext: { startingBranch: 'feature/fallback' }
            } as any
        };

        const result = await sessionContextMenu.checkoutToBranchForSession(session as Session, createOutputChannel());

        assert.strictEqual(result, true);
        assert.strictEqual((repo.checkout as sinon.SinonStub).calledWithExactly('feature/fallback'), true);
    });

    test('checkoutToBranchForSession returns false when no branch information exists anywhere', async () => {
        const repo = createRepository();
        stubGitExtension([repo]);
        sandbox.stub(GitHubAuth, 'getToken').resolves(undefined);
        const session: Partial<Session> = {
            name: 'session-5',
            title: 'Session 5'
        };

        const result = await sessionContextMenu.checkoutToBranchForSession(session as Session, createOutputChannel());

        assert.strictEqual(result, false);
        assert.strictEqual(showErrorMessageStub.called, true);
    });

    test('checkoutToBranchForSession uses PR branch info and remote tracking checkout', async () => {
        const repo = createRepository({
            state: {
                HEAD: { name: 'main' },
                workingTreeChanges: [],
                indexChanges: [],
                remotes: [{ remote: 'origin', fetchUrl: 'https://github.com/fork-owner/fork-repo.git' }]
            },
            checkout: sandbox.stub().onFirstCall().rejects(new Error('pathspec did not match any file(s) known to git')).onSecondCall().resolves(),
            fetch: sandbox.stub().resolves()
        });
        stubGitExtension([repo]);
        sandbox.stub(GitHubAuth, 'getToken').resolves('token');
        sandbox.stub(githubUtils, 'getPullRequestBranchInfo').resolves({
            headBranch: 'feature/pr-123',
            baseBranch: 'main',
            headOwner: 'fork-owner',
            headRepo: 'fork-repo',
            headCloneUrl: 'https://github.com/fork-owner/fork-repo.git',
            state: 'open',
            title: 'Test PR'
        });
        const session: Partial<Session> = {
            name: 'session-6',
            title: 'Session 6',
            outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/123' } } as any]
        };

        const result = await sessionContextMenu.checkoutToBranchForSession(session as Session, createOutputChannel());

        assert.strictEqual(result, true);
        assert.strictEqual((repo.fetch as sinon.SinonStub).calledOnceWithExactly('origin'), true);
        assert.strictEqual((repo.checkout as sinon.SinonStub).callCount, 1);
        assert.strictEqual((repo.createBranch as sinon.SinonStub).calledOnce, true);
    });

    test('checkoutToBranchForSession returns false when fork remote addition is cancelled', async () => {
        const repo = createRepository({
            state: {
                HEAD: { name: 'main' },
                workingTreeChanges: [],
                indexChanges: [],
                remotes: []
            }
        });
        stubGitExtension([repo]);
        sandbox.stub(GitHubAuth, 'getToken').resolves('token');
        sandbox.stub(githubUtils, 'getPullRequestBranchInfo').resolves({
            headBranch: 'feature/pr-123',
            baseBranch: 'main',
            headOwner: 'fork-owner',
            headRepo: 'fork-repo',
            headCloneUrl: 'https://github.com/fork-owner/fork-repo.git',
            state: 'open',
            title: 'Test PR'
        });
        showInformationMessageStub.resolves('Cancel');
        const session: Partial<Session> = {
            name: 'session-7',
            title: 'Session 7',
            outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/123' } } as any]
        };

        const result = await sessionContextMenu.checkoutToBranchForSession(session as Session, createOutputChannel());

        assert.strictEqual(result, false);
    });

    test('openPullRequestInBrowser handles success and failure paths', async () => {
        openExternalStub.onFirstCall().resolves(true);
        openExternalStub.onSecondCall().resolves(false);
        openExternalStub.onThirdCall().rejects(new Error('Network error'));

        await sessionContextMenu.openPullRequestInBrowser('https://github.com/owner/repo/pull/123');
        await sessionContextMenu.openPullRequestInBrowser('https://github.com/owner/repo/pull/456');
        await sessionContextMenu.openPullRequestInBrowser('https://github.com/owner/repo/pull/789');

        assert.strictEqual(openExternalStub.callCount, 3);
        assert.strictEqual(showErrorMessageStub.calledTwice, true);
    });
});
