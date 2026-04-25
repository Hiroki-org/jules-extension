import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
    getCurrentBranchSha,
    getGitApi,
    getRemoteUrl,
    getRepositoryForWorkspaceFolder,
} from '../gitUtils';

suite('gitUtils ユニットテスト', () => {
    let sandbox: sinon.SinonSandbox;
    let outputChannel: { appendLine: sinon.SinonSpy };

    setup(() => {
        sandbox = sinon.createSandbox();
        outputChannel = { appendLine: sandbox.spy() };
    });

    teardown(() => {
        sandbox.restore();
    });

    function workspaceFolder(fsPath: string): vscode.WorkspaceFolder {
        return {
            uri: vscode.Uri.file(fsPath),
            name: 'workspace',
            index: 0,
        };
    }

    test('getGitApi は Git extension を activate して API を返すこと', async () => {
        const gitApi = { repositories: [] };
        const activate = sandbox.stub().resolves();
        const getAPI = sandbox.stub().withArgs(1).returns(gitApi);
        sandbox.stub(vscode.extensions, 'getExtension').withArgs('vscode.git').returns({
            activate,
            exports: { getAPI },
        } as any);

        const result = await getGitApi(outputChannel as any);

        assert.strictEqual(result, gitApi);
        assert.strictEqual(activate.calledOnce, true);
        assert.strictEqual(getAPI.calledOnceWithExactly(1), true);
    });

    test('getGitApi は Git extension がない場合にエラーを投げること', async () => {
        sandbox.stub(vscode.extensions, 'getExtension').withArgs('vscode.git').returns(undefined);

        await assert.rejects(
            async () => await getGitApi(outputChannel as any),
            /Git extension not found/,
        );
        assert.match(outputChannel.appendLine.firstCall.args[0], /vscode\.git extension not found/);
    });

    test('getGitApi は Git API が取得できない場合にエラーを投げること', async () => {
        sandbox.stub(vscode.extensions, 'getExtension').withArgs('vscode.git').returns({
            activate: sandbox.stub().resolves(),
            exports: { getAPI: sandbox.stub().returns(undefined) },
        } as any);

        await assert.rejects(
            async () => await getGitApi(outputChannel as any),
            /Git API not available/,
        );
        assert.match(outputChannel.appendLine.firstCall.args[0], /did not return a Git API/);
    });

    test('getRepositoryForWorkspaceFolder は一致する repository を返すこと', () => {
        const folder = workspaceFolder('/workspace/project');
        const repository = { rootUri: vscode.Uri.file('/workspace/project') };
        const git = {
            repositories: [
                { rootUri: vscode.Uri.file('/workspace/other') },
                repository,
            ],
        };

        const result = getRepositoryForWorkspaceFolder(git, folder, outputChannel as any);

        assert.strictEqual(result, repository);
    });

    test('getRepositoryForWorkspaceFolder は repository がない場合に null を返してログすること', () => {
        const folder = workspaceFolder('/workspace/project\nsecret');
        const git = { repositories: [] };

        const result = getRepositoryForWorkspaceFolder(git, folder, outputChannel as any);

        assert.strictEqual(result, null);
        assert.match(outputChannel.appendLine.firstCall.args[0], /No Git repository found/);
        assert.ok(!outputChannel.appendLine.firstCall.args[0].includes('\nsecret'));
    });

    test('getRemoteUrl は origin の URL を優先して返すこと', () => {
        const repository = {
            state: {
                remotes: [
                    { name: 'upstream', fetchUrl: 'https://github.com/example/upstream.git' },
                    { name: 'origin', fetchUrl: 'https://github.com/example/repo.git' },
                ],
            },
        };

        assert.strictEqual(
            getRemoteUrl(repository, 'origin', outputChannel as any),
            'https://github.com/example/repo.git',
        );
    });

    test('getRemoteUrl は preferred remote がない場合に URL 付き remote へフォールバックすること', () => {
        const repository = {
            state: {
                remotes: [
                    { name: 'backup', pushUrl: 'https://github.com/example/backup.git' },
                ],
            },
        };

        assert.strictEqual(
            getRemoteUrl(repository, 'origin', outputChannel as any),
            'https://github.com/example/backup.git',
        );
        assert.match(outputChannel.appendLine.firstCall.args[0], /Preferred remote/);
    });

    test('getRemoteUrl は remotes が空の場合に null を返すこと', () => {
        const repository = { state: { remotes: [] } };

        assert.strictEqual(getRemoteUrl(repository, 'origin', outputChannel as any), null);
        assert.match(outputChannel.appendLine.firstCall.args[0], /No remotes found/);
    });

    test('getRemoteUrl は URL 付き remote がない場合に null を返すこと', () => {
        const repository = {
            state: {
                remotes: [{ name: 'origin' }],
            },
        };

        assert.strictEqual(getRemoteUrl(repository, 'origin', outputChannel as any), null);
        assert.match(outputChannel.appendLine.firstCall.args[0], /has no fetchUrl or pushUrl/);
    });

    test('getRemoteUrl は preferred remote 不在かつ URL 付き remote もない場合に null を返すこと', () => {
        const repository = {
            state: {
                remotes: [{ name: 'backup' }],
            },
        };

        assert.strictEqual(getRemoteUrl(repository, 'origin', outputChannel as any), null);
        assert.match(outputChannel.appendLine.firstCall.args[0], /No remote URL found/);
    });

    test('getCurrentBranchSha は workspace がない場合に null を返すこと', async () => {
        sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);

        const result = await getCurrentBranchSha(outputChannel as any);

        assert.strictEqual(result, null);
        assert.match(outputChannel.appendLine.firstCall.args[0], /No workspace folder/);
    });

    test('getCurrentBranchSha は現在の HEAD commit を返すこと', async () => {
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([workspaceFolder('/workspace/project')]);
        sandbox.stub(vscode.extensions, 'getExtension').withArgs('vscode.git').returns({
            activate: sandbox.stub().resolves(),
            exports: {
                getAPI: sandbox.stub().returns({
                    repositories: [
                        {
                            rootUri: vscode.Uri.file('/workspace/project'),
                            state: { HEAD: { commit: 'abc123' } },
                        },
                    ],
                }),
            },
        } as any);

        const result = await getCurrentBranchSha(outputChannel as any);

        assert.strictEqual(result, 'abc123');
    });

    test('getCurrentBranchSha は repository が見つからない場合に null を返すこと', async () => {
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([workspaceFolder('/workspace/project')]);
        sandbox.stub(vscode.extensions, 'getExtension').withArgs('vscode.git').returns({
            activate: sandbox.stub().resolves(),
            exports: {
                getAPI: sandbox.stub().returns({
                    repositories: [],
                }),
            },
        } as any);

        const result = await getCurrentBranchSha(outputChannel as any);

        assert.strictEqual(result, null);
    });

    test('getCurrentBranchSha は Git API 取得エラー時に null を返すこと', async () => {
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([workspaceFolder('/workspace/project')]);
        sandbox.stub(vscode.extensions, 'getExtension').withArgs('vscode.git').returns(undefined);

        const result = await getCurrentBranchSha(outputChannel as any);

        assert.strictEqual(result, null);
        assert.strictEqual(
            outputChannel.appendLine.calledWithMatch(/Error getting current branch sha/),
            true,
        );
    });
});
