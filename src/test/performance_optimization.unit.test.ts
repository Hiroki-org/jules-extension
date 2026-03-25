import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getCurrentBranch, initializeActiveRepositoryCache } from '../branchUtils';

suite('Performance Optimization - getCurrentBranch', () => {
    let sandbox: sinon.SinonSandbox;
    let showQuickPickStub: sinon.SinonStub;
    let onDidChangeActiveTextEditorStub: sinon.SinonStub;
    let onDidChangeWorkspaceFoldersStub: sinon.SinonStub;
    let onDidChangeActiveTextEditorHandler: ((editor: vscode.TextEditor | undefined) => void) | undefined;
    let onDidChangeWorkspaceFoldersHandler: ((event: vscode.WorkspaceFoldersChangeEvent) => void) | undefined;
    let outputChannelStub: vscode.OutputChannel;
    let contextSubscriptions: vscode.Disposable[];
    let gitApi: { repositories: Array<{ rootUri: { fsPath: string }, state: { HEAD: { name: string }, remotes: any[] } }> };
    const activeEditorState: { current: vscode.TextEditor | undefined } = { current: undefined };

    const buildEditor = (fsPath: string): vscode.TextEditor => ({
        document: {
            uri: {
                fsPath,
                scheme: 'file',
                toString: () => `file://${fsPath}`
            } as vscode.Uri
        }
    } as vscode.TextEditor);

    setup(() => {
        sandbox = sinon.createSandbox();
        showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
        outputChannelStub = { appendLine: sandbox.stub() } as unknown as vscode.OutputChannel;
        sandbox.stub(vscode.window, 'activeTextEditor').get(() => activeEditorState.current);

        onDidChangeActiveTextEditorStub = sandbox
            .stub(vscode.window, 'onDidChangeActiveTextEditor')
            .callsFake((handler: (editor: vscode.TextEditor | undefined) => void) => {
                onDidChangeActiveTextEditorHandler = handler;
                return { dispose: () => { } };
            });

        onDidChangeWorkspaceFoldersStub = sandbox
            .stub(vscode.workspace, 'onDidChangeWorkspaceFolders')
            .callsFake((handler: (event: vscode.WorkspaceFoldersChangeEvent) => void) => {
                onDidChangeWorkspaceFoldersHandler = handler;
                return { dispose: () => { } };
            });

        gitApi = {
            repositories: [
                { rootUri: { fsPath: '/repo1' }, state: { HEAD: { name: 'main' }, remotes: [] } },
                { rootUri: { fsPath: '/repo2' }, state: { HEAD: { name: 'dev' }, remotes: [] } }
            ]
        };
        const gitExtension = {
            exports: {
                getAPI: () => gitApi
            }
        };
        sandbox.stub(vscode.extensions, 'getExtension').returns(gitExtension as any);

        contextSubscriptions = [];
        initializeActiveRepositoryCache(contextSubscriptions);
        onDidChangeActiveTextEditorHandler?.(undefined);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Baseline: showQuickPick is called when multiple repositories exist', async () => {
        await getCurrentBranch(outputChannelStub);
        assert.ok(showQuickPickStub.called, 'showQuickPick should be called');
    });

    test('Optimization: showQuickPick is NOT called when silent mode is enabled', async () => {
        activeEditorState.current = buildEditor('/repo1/src/file.ts');
        await getCurrentBranch(outputChannelStub, { silent: true });
        assert.ok(showQuickPickStub.notCalled, 'showQuickPick should NOT be called');
    });

    test('Optimization: correctly infers repository from active editor in silent mode', async () => {
        activeEditorState.current = buildEditor('/repo2/src/file.ts');

        const branch = await getCurrentBranch(outputChannelStub, { silent: true });

        assert.strictEqual(branch, 'dev', 'Should infer repo2 and return its branch "dev"');
        assert.ok(showQuickPickStub.notCalled, 'showQuickPick should NOT be called');
    });

    test('Optimization: cache hit in silent mode skips repository scan', async () => {
        const findSpy = sandbox.spy(gitApi.repositories, 'find');
        activeEditorState.current = buildEditor('/repo2/src/file.ts');

        const first = await getCurrentBranch(outputChannelStub, { silent: true });
        assert.strictEqual(first, 'dev');
        assert.strictEqual(findSpy.callCount, 1, 'first call should perform lookup');

        const second = await getCurrentBranch(outputChannelStub, { silent: true });
        assert.strictEqual(second, 'dev');
        assert.strictEqual(findSpy.callCount, 1, 'second call should reuse cached repository');
    });

    test('Optimization: active editor change invalidates cache', async () => {
        const findSpy = sandbox.spy(gitApi.repositories, 'find');
        const firstEditor = buildEditor('/repo2/src/file.ts');
        const secondEditor = buildEditor('/repo1/src/other.ts');

        activeEditorState.current = firstEditor;
        const first = await getCurrentBranch(outputChannelStub, { silent: true });
        assert.strictEqual(first, 'dev');
        assert.strictEqual(findSpy.callCount, 1);

        activeEditorState.current = secondEditor;
        onDidChangeActiveTextEditorHandler?.(secondEditor);

        const second = await getCurrentBranch(outputChannelStub, { silent: true });
        assert.strictEqual(second, 'main');
        assert.strictEqual(findSpy.callCount, 2, 'cache should be invalidated after editor change');
    });

    test('Optimization: workspace folder change invalidates cache', async () => {
        const findSpy = sandbox.spy(gitApi.repositories, 'find');
        const editor = buildEditor('/repo2/src/file.ts');
        activeEditorState.current = editor;

        const first = await getCurrentBranch(outputChannelStub, { silent: true });
        assert.strictEqual(first, 'dev');
        assert.strictEqual(findSpy.callCount, 1);

        onDidChangeWorkspaceFoldersHandler?.({ added: [], removed: [] });

        const second = await getCurrentBranch(outputChannelStub, { silent: true });
        assert.strictEqual(second, 'dev');
        assert.strictEqual(findSpy.callCount, 2, 'cache should be invalidated after workspace folder change');
    });

    test('Optimization: boundary check distinguishes /repo and /repo2', async () => {
        const localGitApi = {
            repositories: [
                { rootUri: { fsPath: '/repo' }, state: { HEAD: { name: 'main' }, remotes: [] } },
                { rootUri: { fsPath: '/repo2' }, state: { HEAD: { name: 'dev' }, remotes: [] } }
            ]
        };
        const gitExtension = {
            exports: {
                getAPI: () => localGitApi
            }
        };
        (vscode.extensions.getExtension as sinon.SinonStub).returns(gitExtension as any);
        activeEditorState.current = buildEditor('/repo2/src/file.ts');

        const branch = await getCurrentBranch(outputChannelStub, { silent: true });

        assert.strictEqual(branch, 'dev', 'Should match /repo2, not /repo');
    });

    test('Optimization: listeners are registered via initializeActiveRepositoryCache', () => {
        assert.strictEqual(onDidChangeActiveTextEditorStub.calledOnce, true);
        assert.strictEqual(onDidChangeWorkspaceFoldersStub.calledOnce, true);
        assert.strictEqual(contextSubscriptions.length, 2);
    });
});
