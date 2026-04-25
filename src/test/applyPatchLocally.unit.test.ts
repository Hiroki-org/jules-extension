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
            inputBox: { value: '' },
            rootUri: { fsPath: '/repo' },
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

    test('git apply 失敗時は保存済み patch パスをエラーに含めること', async () => {
        sandbox.stub(Date, 'now').returns(1234);
        execFileStub.callsFake(((_file: string, _args: string[], _options: any, callback: any) => {
            callback(new Error('apply failed'), '', 'fatal: patch failed');
            return {} as childProcess.ChildProcess;
        }) as any);

        await applyPatchLocallyForSession({
            session: createSession(),
            changeSet: createChangeSet(),
            outputChannel,
        });

        const expectedPath = path.join(os.tmpdir(), 'jules-abc-1234.patch');
        assert.match(showErrorMessageStub.firstCall.args[0], /Failed to apply patch/);
        assert.ok(
            showErrorMessageStub.firstCall.args[0].includes(expectedPath),
            'エラーメッセージに patch ファイルの保存先を含めるべき',
        );
        await fs.rm(expectedPath, { force: true });
    });
});
