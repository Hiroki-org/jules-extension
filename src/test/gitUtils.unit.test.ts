import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getGitApi, getRepositoryForWorkspaceFolder, getRemoteUrl, getCurrentBranchSha } from '../gitUtils';

suite('gitUtils', () => {
    let sandbox: sinon.SinonSandbox;
    let mockOutputChannel: any;

    setup(() => {
        sandbox = sinon.createSandbox();
        mockOutputChannel = {
            name: 'Mock',
            append: sandbox.stub(),
            appendLine: sandbox.stub(),
            replace: sandbox.stub(),
            clear: sandbox.stub(),
            show: sandbox.stub(),
            hide: sandbox.stub(),
            dispose: sandbox.stub()
        };
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('getGitApi', () => {
        test('should throw an error if vscode.git extension is not found', async () => {
            sandbox.stub(vscode.extensions, 'getExtension').returns(undefined);
            await assert.rejects(getGitApi(mockOutputChannel), /Git extension not found/);
        });

        test('should throw an error if git extension does not return an API', async () => {
            const extMock = { activate: sandbox.stub().resolves(), exports: { getAPI: sandbox.stub().returns(undefined) } };
            sandbox.stub(vscode.extensions, 'getExtension').returns(extMock as any);
            await assert.rejects(getGitApi(mockOutputChannel), /Git API not available/);
        });

        test('should return git api successfully', async () => {
            const gitApiMock = { repositories: [] };
            const extMock = { activate: sandbox.stub().resolves(), exports: { getAPI: sandbox.stub().returns(gitApiMock) } };
            sandbox.stub(vscode.extensions, 'getExtension').returns(extMock as any);
            const api = await getGitApi(mockOutputChannel);
            assert.strictEqual(api, gitApiMock);
        });
    });

    suite('getRepositoryForWorkspaceFolder', () => {
        test('should return null if repository is not found', () => {
            const git = { repositories: [] };
            const workspaceFolder = { uri: { fsPath: '/test/path' } } as any;
            const repo = getRepositoryForWorkspaceFolder(git, workspaceFolder, mockOutputChannel);
            assert.strictEqual(repo, null);
        });

        test('should return repository if found', () => {
            const repoMock = { rootUri: { fsPath: '/test/path' } };
            const git = { repositories: [repoMock] };
            const workspaceFolder = { uri: { fsPath: '/test/path' } } as any;
            const repo = getRepositoryForWorkspaceFolder(git, workspaceFolder, mockOutputChannel);
            assert.strictEqual(repo, repoMock);
        });

        test('should sanitize workspace path before logging when repository is missing', () => {
            const git = { repositories: [] };
            const workspaceFolder = { uri: { fsPath: '/workspace/project' + String.fromCharCode(10) + 'secret' } } as any;

            const repo = getRepositoryForWorkspaceFolder(git, workspaceFolder, mockOutputChannel);

            assert.strictEqual(repo, null);
            const loggedMessage = mockOutputChannel.appendLine.firstCall.args[0];
            assert.ok(loggedMessage.includes('secret'));
            assert.strictEqual(loggedMessage.includes(String.fromCharCode(10)), false);
        });
    });

    suite('getRemoteUrl', () => {
        test('should return null if there are no remotes', () => {
            const repo = { state: { remotes: [] } };
            const url = getRemoteUrl(repo, 'origin', mockOutputChannel);
            assert.strictEqual(url, null);
        });

        test('should return null if no remote has fetchUrl or pushUrl', () => {
            const repo = { state: { remotes: [{ name: 'origin', fetchUrl: undefined, pushUrl: undefined }] } };
            const url = getRemoteUrl(repo, 'origin', mockOutputChannel);
            assert.strictEqual(url, null);
        });

        test('should return origin remote url', () => {
            const repo = { state: { remotes: [{ name: 'origin', fetchUrl: 'https://origin.url' }] } };
            const url = getRemoteUrl(repo, 'origin', mockOutputChannel);
            assert.strictEqual(url, 'https://origin.url');
        });

        test('should fallback to first remote with url if origin not found', () => {
            const repo = { state: { remotes: [{ name: 'upstream', fetchUrl: 'https://upstream.url' }] } };
            const url = getRemoteUrl(repo, 'origin', mockOutputChannel);
            assert.strictEqual(url, 'https://upstream.url');
        });
    });

    suite('getCurrentBranchSha', () => {
        test('should return null if no workspace folders exist', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined);
            const sha = await getCurrentBranchSha(mockOutputChannel);
            assert.strictEqual(sha, null);
        });

        test('should handle errors thrown by getGitApi', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/path' } }] as any);
            sandbox.stub(vscode.extensions, 'getExtension').returns(undefined); // Causes getGitApi to throw
            const sha = await getCurrentBranchSha(mockOutputChannel);
            assert.strictEqual(sha, null);
        });

        test('should return null if repository not found', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/path' } }] as any);
            const gitApiMock = { repositories: [] };
            const extMock = { activate: sandbox.stub().resolves(), exports: { getAPI: sandbox.stub().returns(gitApiMock) } };
            sandbox.stub(vscode.extensions, 'getExtension').returns(extMock as any);

            const sha = await getCurrentBranchSha(mockOutputChannel);
            assert.strictEqual(sha, null);
        });

        test('should return HEAD commit SHA', async () => {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/path' } }] as any);
            const repoMock = {
                rootUri: { fsPath: '/path' },
                state: { HEAD: { commit: '12345abcde' } }
            };
            const gitApiMock = { repositories: [repoMock] };
            const extMock = { activate: sandbox.stub().resolves(), exports: { getAPI: sandbox.stub().returns(gitApiMock) } };
            sandbox.stub(vscode.extensions, 'getExtension').returns(extMock as any);

            const sha = await getCurrentBranchSha(mockOutputChannel);
            assert.strictEqual(sha, '12345abcde');
        });
    });
});
