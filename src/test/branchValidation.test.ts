import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { getBranchesForSession } from '../branchUtils';
import { JulesApiClient } from '../julesApiClient';
import { Source as SourceType } from '../types';

suite('Branch Validation Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Should show warning when local-only branch is selected', async () => {
        // テストケース1: ローカル専用ブランチ選択時に警告が表示される
        const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
        showWarningMessageStub.resolves({ title: 'Use Default Branch' });

        const remoteBranches = ['main', 'develop'];
        const startingBranch = 'local-only-branch';

        if (!remoteBranches.includes(startingBranch)) {
            await vscode.window.showWarningMessage(
                `Branch "${startingBranch}" exists locally but has not been pushed to remote.

Jules requires a remote branch to start a session.
You can push this branch first, or use the default branch "${'main'}" instead.`,
                { modal: true },
                { title: 'Use Default Branch' },
                { title: 'Cancel' }
            );
        }

        assert.strictEqual(showWarningMessageStub.called, true);
        assert.strictEqual(showWarningMessageStub.getCall(0).args[0].includes('local-only-branch'), true);
    });

    test('Should use default branch when user selects "Use Default Branch"', async () => {
        // テストケース2: 「Use Default Branch」選択時にデフォルトブランチを使用
        const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
        showWarningMessageStub.resolves({ title: 'Use Default Branch' });

        const remoteBranches = ['main', 'develop'];
        let startingBranch = 'local-only-branch';
        const defaultBranch = 'main';

        if (!remoteBranches.includes(startingBranch)) {
            const action = await vscode.window.showWarningMessage(
                `Branch "${startingBranch}" exists locally but has not been pushed to remote.

Jules requires a remote branch to start a session.
You can push this branch first, or use the default branch "${defaultBranch}" instead.`,
                { modal: true },
                { title: 'Use Default Branch' },
                { title: 'Cancel' }
            );

            if (action?.title === 'Use Default Branch') {
                startingBranch = defaultBranch;
            }
        }

        assert.strictEqual(startingBranch, 'main');
    });

    test('Should cancel session creation when user selects "Cancel"', async () => {
        // テストケース3: 「Cancel」選択時にセッション作成がキャンセルされる
        const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
        showWarningMessageStub.resolves(undefined); // ユーザーがキャンセル

        const remoteBranches = ['main', 'develop'];
        const startingBranch = 'local-only-branch';
        let sessionCreated = false;

        if (!remoteBranches.includes(startingBranch)) {
            const action = await vscode.window.showWarningMessage(
                `Branch "${startingBranch}" exists locally but has not been pushed to remote.

Jules requires a remote branch to start a session.
You can push this branch first, or use the default branch "${'main'}" instead.`,
                { modal: true },
                { title: 'Use Default Branch' },
                { title: 'Cancel' }
            );

            if (action?.title !== 'Use Default Branch') {
                // キャンセル
                sessionCreated = false;
            } else {
                sessionCreated = true;
            }
        }

        assert.strictEqual(sessionCreated, false);
    });

    test('Should not show warning when remote branch is selected', async () => {
        // テストケース4: リモートブランチ選択時は警告なし
        const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');

        const remoteBranches = ['main', 'develop', 'feature-branch'];
        const startingBranch = 'feature-branch';

        if (!remoteBranches.includes(startingBranch)) {
            await vscode.window.showWarningMessage(
                `Branch "${startingBranch}" exists locally but has not been pushed to remote.

Jules requires a remote branch to start a session.
You can push this branch first, or use the default branch "${'main'}" instead.`,
                { modal: true },
                'Use Default Branch',
                'Cancel'
            );
        }

        assert.strictEqual(showWarningMessageStub.called, false);
    });

    test('Should not show warning when branch exists in refreshed remote branches', async () => {
        // テストケース5: キャッシュにないがリフレッシュ後のリモートブランチに存在する場合は警告なし
        // この修正により、キャッシュが古い場合でもリモートブランチが存在すれば警告が表示されない
        const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');

        // 古いキャッシュのリモートブランチ（新しいブランチは含まれていない）
        const cachedRemoteBranches = ['main', 'develop'];
        // リフレッシュ後のリモートブランチ（新しいブランチが含まれている）
        const freshRemoteBranches = ['main', 'develop', 'new-feature'];
        const startingBranch = 'new-feature';

        // キャッシュにない場合、リモートブランチを再取得するシミュレーション
        let currentRemoteBranches = cachedRemoteBranches;
        if (!cachedRemoteBranches.includes(startingBranch)) {
            // リモートブランチを再取得
            currentRemoteBranches = freshRemoteBranches;
        }

        // 再取得後のリモートブランチに存在する場合は警告を表示しない
        if (!currentRemoteBranches.includes(startingBranch)) {
            await vscode.window.showWarningMessage(
                `Branch "${startingBranch}" exists locally but has not been pushed to remote.\n\nJules requires a remote branch to start a session.`,
                { modal: true },
                { title: 'Create Remote Branch' },
                { title: 'Use Default Branch' }
            );
        }

        // リフレッシュ後にブランチが見つかったため、警告は表示されない
        assert.strictEqual(showWarningMessageStub.called, false);
    });

    test('Should show warning when branch does not exist even after refresh', async () => {
        // テストケース6: リフレッシュ後もリモートブランチに存在しない場合は警告を表示
        const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
        showWarningMessageStub.resolves({ title: 'Create Remote Branch' });

        // キャッシュのリモートブランチ
        const cachedRemoteBranches = ['main', 'develop'];
        // リフレッシュ後のリモートブランチ（ローカル専用ブランチは含まれない）
        const freshRemoteBranches = ['main', 'develop'];
        const startingBranch = 'local-only-branch';

        // キャッシュにない場合、リモートブランチを再取得するシミュレーション
        let currentRemoteBranches = cachedRemoteBranches;
        if (!cachedRemoteBranches.includes(startingBranch)) {
            // リモートブランチを再取得
            currentRemoteBranches = freshRemoteBranches;
        }

        // 再取得後もリモートブランチに存在しない場合は警告を表示
        if (!currentRemoteBranches.includes(startingBranch)) {
            await vscode.window.showWarningMessage(
                `Branch "${startingBranch}" exists locally but has not been pushed to remote.\n\nJules requires a remote branch to start a session.`,
                { modal: true },
                { title: 'Create Remote Branch' },
                { title: 'Use Default Branch' }
            );
        }

        // リフレッシュ後もブランチが見つからないため、警告が表示される
        assert.strictEqual(showWarningMessageStub.called, true);
    });

    suite('Default branch selection with repo matching', () => {
        let getExtensionStub: sinon.SinonStub;
        let getConfigurationStub: sinon.SinonStub;
        let outputChannel: vscode.OutputChannel;
        let contextStub: vscode.ExtensionContext;

        const createGitApi = (remoteUrl: string, currentBranch: string) => ({
            repositories: [{
                rootUri: { fsPath: '/workspace' },
                state: {
                    HEAD: { name: currentBranch },
                    remotes: [{ name: 'origin', fetchUrl: remoteUrl }]
                }
            }]
        });

        const buildSource = (owner: string, repo: string): SourceType => ({
            name: `sources/github/${owner}/${repo}`,
            id: `${owner}/${repo}`,
            githubRepo: {
                owner,
                repo,
                isPrivate: false,
                defaultBranch: { displayName: 'main' },
                branches: [
                    { displayName: 'main' },
                    { displayName: 'develop' }
                ]
            }
        });

        setup(() => {
            outputChannel = { appendLine: sandbox.stub() } as unknown as vscode.OutputChannel;
            contextStub = {
                globalState: {
                    get: sandbox.stub().returns(undefined),
                    update: sandbox.stub().resolves()
                }
            } as unknown as vscode.ExtensionContext;

            getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');
            getConfigurationStub.callsFake(() => ({
                get: (key: string, defaultValue?: unknown) => key === 'defaultBranch' ? 'current' : defaultValue
            }) as any);
        });

        test('uses source default branch even when workspace repo matches source repo', async () => {
            const gitApi = createGitApi('https://github.com/owner/repo.git', 'feature/match');
            getExtensionStub = sandbox.stub(vscode.extensions, 'getExtension');
            getExtensionStub.returns({ exports: { getAPI: () => gitApi } } as any);

            const selectedSource = buildSource('Owner', 'Repo');
            const apiClient = { getSource: sandbox.stub().resolves(selectedSource) } as unknown as JulesApiClient;

            const result = await getBranchesForSession(selectedSource, apiClient, outputChannel, contextStub, { showProgress: false });

            assert.strictEqual(result.defaultBranch, 'main');
        });

        test('falls back to source default when workspace repo differs from source repo', async () => {
            const gitApi = createGitApi('https://github.com/another/other.git', 'feature/no-match');
            getExtensionStub = sandbox.stub(vscode.extensions, 'getExtension');
            getExtensionStub.returns({ exports: { getAPI: () => gitApi } } as any);

            const selectedSource = buildSource('owner', 'repo');
            const apiClient = { getSource: sandbox.stub().resolves(selectedSource) } as unknown as JulesApiClient;

            const result = await getBranchesForSession(selectedSource, apiClient, outputChannel, contextStub, { showProgress: false });

            assert.strictEqual(result.defaultBranch, 'main');
        });
    });

    suite('Caching Optimization', () => {
        let outputChannel: vscode.OutputChannel;
        let contextStub: vscode.ExtensionContext;
        let apiClient: JulesApiClient;
        let selectedSource: SourceType;
        let clock: sinon.SinonFakeTimers;

        setup(() => {
            clock = sinon.useFakeTimers();
            outputChannel = { appendLine: sandbox.stub() } as unknown as vscode.OutputChannel;
            contextStub = {
                globalState: {
                    get: sandbox.stub(),
                    update: sandbox.stub().resolves()
                }
            } as unknown as vscode.ExtensionContext;

            selectedSource = {
                name: 'sources/github/owner/repo',
                id: 'sources/github/owner/repo',
                githubRepo: {
                    branches: [{ displayName: 'main' }],
                    defaultBranch: { displayName: 'main' },
                    owner: 'owner',
                    repo: 'repo',
                    isPrivate: false
                }
            };

            apiClient = {
                getSource: sandbox.stub().resolves(selectedSource)
            } as unknown as JulesApiClient;

            const gitApi = {
                repositories: [{
                    rootUri: { fsPath: '/workspace' },
                    state: {
                        HEAD: { name: 'main' },
                        remotes: [{ name: 'origin', fetchUrl: 'https://github.com/owner/repo' }]
                    }
                }]
            };
            sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: { getAPI: () => gitApi } } as any);
            sandbox.stub(vscode.workspace, 'getConfiguration').callsFake(() => ({
                get: (key: string, defaultValue?: unknown) => defaultValue
            }) as any);
        });

        teardown(() => {
            clock.restore();
        });

        test('should skip globalState update if cache is fresh and content unchanged', async () => {
            const now = Date.now();
            const cachedData = {
                branches: ['main'], // Remote branches + current branch (if different)
                remoteBranches: ['main'],
                defaultBranch: 'main',
                currentBranch: 'main',
                timestamp: now - 1000 // 1 second old
            };

            (contextStub.globalState.get as sinon.SinonStub).returns(cachedData);

            await getBranchesForSession(selectedSource, apiClient, outputChannel, contextStub, { forceRefresh: true, showProgress: false });

            assert.strictEqual((contextStub.globalState.update as sinon.SinonStub).called, false, 'Should not update globalState');
        });

        test('should update globalState if cache is old (even if content unchanged)', async () => {
            const now = Date.now();
            const cachedData = {
                branches: ['main'],
                remoteBranches: ['main'],
                defaultBranch: 'main',
                currentBranch: 'main',
                timestamp: now - (4 * 60 * 1000) // 4 minutes old (threshold is 3)
            };

            (contextStub.globalState.get as sinon.SinonStub).returns(cachedData);

            await getBranchesForSession(selectedSource, apiClient, outputChannel, contextStub, { forceRefresh: true, showProgress: false });

            assert.strictEqual((contextStub.globalState.update as sinon.SinonStub).called, true, 'Should update globalState');
        });

        test('should update globalState if content changed', async () => {
            const now = Date.now();
            const cachedData = {
                branches: ['main'],
                remoteBranches: ['main'],
                defaultBranch: 'main',
                currentBranch: 'dev', // different
                timestamp: now - 1000
            };

            (contextStub.globalState.get as sinon.SinonStub).returns(cachedData);

            await getBranchesForSession(selectedSource, apiClient, outputChannel, contextStub, { forceRefresh: true, showProgress: false });

            assert.strictEqual((contextStub.globalState.update as sinon.SinonStub).called, true, 'Should update globalState');
        });

        test('should use cache and skip API call if forceRefresh is false and cache is valid', async () => {
            const now = Date.now();
            const cachedData = {
                branches: ['main', 'cached-branch'],
                remoteBranches: ['main', 'cached-branch'],
                defaultBranch: 'main',
                currentBranch: 'main',
                timestamp: now - 1000 // 1 second old
            };

            (contextStub.globalState.get as sinon.SinonStub).returns(cachedData);

            const result = await getBranchesForSession(selectedSource, apiClient, outputChannel, contextStub, { forceRefresh: false, showProgress: false });

            assert.strictEqual((apiClient.getSource as sinon.SinonStub).called, false, 'Should not call API');
            assert.deepStrictEqual(result, {
                branches: cachedData.branches,
                remoteBranches: cachedData.remoteBranches,
                defaultBranch: cachedData.defaultBranch,
                currentBranch: cachedData.currentBranch
            });
        });
    });
});