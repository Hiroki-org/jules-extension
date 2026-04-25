import * as assert from 'assert';
import childProcess = require('child_process');
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { applyPatchLocallyForSession } from '../applyPatchLocally';
import * as gitUtils from '../gitUtils';
import * as sessionContextMenu from '../sessionContextMenu';
import { ChangeSetSummary } from '../sessionArtifacts';
import { Session } from '../types';

suite('applyPatchLocallyForSession ユニットテスト', () => {
    let sandbox: sinon.SinonSandbox;
    let repository: any;
    let outputChannel: vscode.OutputChannel;
    let getGitApiStub: sinon.SinonStub;
    let execFileStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let showWarningMessageStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        repository = {
            fetch: sandbox.stub().resolves(),
            getCommit: sandbox.stub().resolves({ hash: 'base-sha' }),
            getBranch: sandbox.stub().rejects(new Error('branch not found')),
            createBranch: sandbox.stub().resolves(),
            checkout: sandbox.stub().resolves(),
            inputBox: { value: '' },
            rootUri: { fsPath: '/repo' },
            state: { HEAD: { name: 'main' }, remotes: [] },
        };
        outputChannel = {
            appendLine: sandbox.spy(),
        } as any;

        getGitApiStub = sandbox.stub(gitUtils, 'getGitApi').resolves({
            repositories: [repository],
            git: { path: '/custom/git' },
        });
        sandbox.stub(sessionContextMenu, 'selectRepository').resolves(repository);
        sandbox.stub(sessionContextMenu, 'handleUncommittedChanges').resolves(true);
        showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
        showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        execFileStub = sandbox.stub(childProcess, 'execFile');
        execFileStub.callsFake(((_file: string, _args: string[], _options: any, callback: any) => {
            callback(null, '', '');
            return {} as childProcess.ChildProcess;
        }) as any);
    });

    teardown(() => {
        sandbox.restore();
    });

    function createSession(): Session {
        return {
            name: 'sessions/abc',
            title: 'Apply patch session',
            state: 'COMPLETED',
            rawState: 'COMPLETED',
            sourceContext: {
                source: 'sources/github/Hiroki-org/jules-extension',
                githubRepoContext: {
                    startingBranch: 'main',
                },
            },
        };
    }

    function createChangeSet(rawGitPatch: Record<string, unknown> = {}): ChangeSetSummary {
        return {
            files: [],
            raw: {
                gitPatch: {
                    unidiffPatch: 'diff --git a/src/file.ts b/src/file.ts\n--- a/src/file.ts\n+++ b/src/file.ts',
                    baseCommitId: 'base-sha',
                    suggestedCommitMessage: 'feat: apply patch locally',
                    ...rawGitPatch,
                },
            },
            baseCommitId: 'base-sha',
            suggestedCommitMessage: 'feat: apply patch locally',
        };
    }

    test('ブランチ名衝突時にユニークなブランチ名で作成し、VS Code Git API の git path を使うこと', async () => {
        repository.getBranch.resetBehavior();
        repository.getBranch.onFirstCall().resolves({ name: 'jules-patch-abc' });
        repository.getBranch.onSecondCall().resolves({ name: 'jules-patch-abc-2' });
        repository.getBranch.onThirdCall().rejects(new Error('branch not found'));

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.deepStrictEqual(repository.createBranch.firstCall.args, [
            'jules-patch-abc-3',
            true,
            'base-sha',
        ]);
        assert.strictEqual(execFileStub.firstCall.args[0], '/custom/git');
        assert.strictEqual(repository.inputBox.value, 'feat: apply patch locally');
    });

    test('baseCommitId が解決できない場合は startingBranch へのフォールバック確認を使うこと', async () => {
        repository.getCommit.rejects(new Error('commit not found'));
        showWarningMessageStub.resolves('Fallback');

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(showWarningMessageStub.calledOnce, true);
        assert.deepStrictEqual(repository.createBranch.firstCall.args, [
            'jules-patch-abc',
            true,
            'main',
        ]);
    });

    test('startingBranch のローカル branch がない場合は origin の追跡 ref にフォールバックすること', async () => {
        repository.state = { remotes: [{ name: 'upstream' }, { name: 'origin' }] };
        repository.getCommit.rejects(new Error('commit not found'));
        repository.getBranch.callsFake(async (branchRef: string) => {
            if (branchRef === 'origin/main') {
                return { name: 'origin/main' };
            }
            throw new Error('branch not found');
        });
        showWarningMessageStub.resolves('Fallback');

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(repository.getBranch.calledWith('main'), true);
        assert.strictEqual(repository.getBranch.calledWith('origin/main'), true);
        assert.deepStrictEqual(repository.createBranch.firstCall.args, [
            'jules-patch-abc',
            true,
            'origin/main',
        ]);
    });

    test('gitPatch または unidiffPatch が欠落している場合はエラーを表示して処理を止めること', async () => {
        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: { files: [], raw: {} },
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /gitPatch/);
        assert.strictEqual(getGitApiStub.called, false);

        showErrorMessageStub.resetHistory();
        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: {
                files: [],
                raw: { gitPatch: {} },
            },
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /unidiffPatch/);
        assert.strictEqual(getGitApiStub.called, false);
    });

    test('git apply 失敗時は元ブランチへ戻し、保存済み patch パスをエラーに含めること', async () => {
        sandbox.stub(Date, 'now').returns(1234);
        const expectedPath = path.join(os.tmpdir(), 'jules-abc-1234.patch');
        await fs.rm(expectedPath, { force: true });
        execFileStub.callsFake(((_file: string, _args: string[], _options: any, callback: any) => {
            callback(new Error('apply failed'), '', 'fatal: patch failed');
            return {} as childProcess.ChildProcess;
        }) as any);

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /Failed to apply patch/);
        assert.strictEqual(repository.checkout.calledOnceWithExactly('main'), true);
        assert.match(showErrorMessageStub.firstCall.args[0], /Restored original branch "main"/);
        assert.ok(
            showErrorMessageStub.firstCall.args[0].includes(expectedPath),
            'エラーメッセージに patch ファイルの保存先を含めるべき',
        );
        const patchStats = await fs.stat(expectedPath);
        if (process.platform !== 'win32') {
            assert.strictEqual(patchStats.mode & 0o777, 0o600);
        }
        await fs.rm(expectedPath, { force: true });
    });

    test('Git repository がない場合はエラーを表示して止めること', async () => {
        getGitApiStub.resolves({ repositories: [], git: { path: '/custom/git' } });

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /No Git repository/);
        assert.strictEqual(repository.fetch.called, false);
    });

    test('repository 選択がキャンセルされた場合は処理を止めること', async () => {
        (sessionContextMenu.selectRepository as sinon.SinonStub).resolves(undefined);

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(repository.fetch.called, false);
    });

    test('未コミット変更チェックで進行不可の場合は処理を止めること', async () => {
        (sessionContextMenu.handleUncommittedChanges as sinon.SinonStub).resolves(false);

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(repository.fetch.called, false);
    });

    test('fetch が失敗した場合はエラーを表示して止めること', async () => {
        repository.fetch.rejects(new Error('fetch failed'));

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /Failed to fetch from remote: fetch failed/);
        assert.strictEqual(repository.createBranch.called, false);
    });

    test('fallback 確認でキャンセルされた場合は処理を止めること', async () => {
        repository.getCommit.rejects(new Error('commit not found'));
        showWarningMessageStub.resolves('Cancel');

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(repository.createBranch.called, false);
    });

    test('baseCommitId も startingBranch もない場合はエラーを表示すること', async () => {
        repository.getCommit.rejects(new Error('commit not found'));
        const session = createSession();
        session.sourceContext = undefined;

        await applyPatchLocallyForSession({
            session,
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /Base commit not found/);
        assert.strictEqual(repository.createBranch.called, false);
    });

    test('startingBranch が空白だけの場合はエラーを表示すること', async () => {
        repository.getCommit.rejects(new Error('commit not found'));
        const session = createSession();
        session.sourceContext!.githubRepoContext!.startingBranch = '   ';

        await applyPatchLocallyForSession({
            session,
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /Base commit not found/);
        assert.strictEqual(repository.createBranch.called, false);
    });

    test('createBranch が失敗した場合はエラーを表示すること', async () => {
        repository.createBranch.rejects(new Error('branch create failed'));

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /Failed to create branch: branch create failed/);
        assert.strictEqual(execFileStub.called, false);
    });

    test('Git API に git.path がない場合は git コマンド名へフォールバックすること', async () => {
        getGitApiStub.resolves({ repositories: [repository], git: {} });

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(execFileStub.firstCall.args[0], 'git');
        assert.strictEqual(
            (outputChannel.appendLine as sinon.SinonSpy).calledWithMatch(/falling back to 'git'/),
            true,
        );
    });

    test('getBranch が undefined を返す場合はそのブランチ名を使うこと', async () => {
        repository.getBranch.resolves(undefined);

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(repository.createBranch.firstCall.args[0], 'jules-patch-abc');
    });

    test('getBranch の構造化された not found コードをブランチ不在として扱うこと', async () => {
        repository.getBranch.rejects(Object.assign(new Error('missing ref'), { code: 'BranchNotFound' }));

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(repository.createBranch.firstCall.args[0], 'jules-patch-abc');
    });

    test('getBranch の日本語 not found メッセージをブランチ不在として扱うこと', async () => {
        repository.getBranch.rejects(new Error('ブランチが見つかりません'));

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.strictEqual(repository.createBranch.firstCall.args[0], 'jules-patch-abc');
    });

    test('getBranch が branch not found 以外のエラーを返す場合は全体エラーにすること', async () => {
        repository.getBranch.rejects(new Error('repository is locked'));

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /An error occurred: repository is locked/);
        assert.strictEqual(repository.createBranch.called, false);
    });

    test('利用可能なブランチ名が探索上限まで見つからない場合は全体エラーにすること', async () => {
        repository.getBranch.resolves({ name: 'existing' });

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        assert.match(showErrorMessageStub.firstCall.args[0], /Could not find an available branch name/);
        assert.strictEqual(repository.createBranch.called, false);
        assert.strictEqual(repository.getBranch.callCount, 20);
    });
});
