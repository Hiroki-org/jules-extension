import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getCurrentBranch } from '../branchUtils';

suite('Performance Optimization - getActiveRepository', () => {
    let sandbox: sinon.SinonSandbox;
    let showQuickPickStub: sinon.SinonStub;
    let outputChannelStub: any;

    setup(() => {
        sandbox = sinon.createSandbox();
        showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
        outputChannelStub = { appendLine: sandbox.stub() };

        // Mock vscode.extensions.getExtension
        const gitApi = {
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
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Baseline: showQuickPick is called when multiple repositories exist', async () => {
        await getCurrentBranch(outputChannelStub);
        assert.ok(showQuickPickStub.called, 'showQuickPick should be called');
    });

    test('Optimization: showQuickPick is NOT called when silent mode is enabled', async () => {
        await getCurrentBranch(outputChannelStub, { silent: true });
        assert.ok(showQuickPickStub.notCalled, 'showQuickPick should NOT be called');
    });
});
