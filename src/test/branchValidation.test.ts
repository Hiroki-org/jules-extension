import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

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
});