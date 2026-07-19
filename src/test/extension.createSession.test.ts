import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { activate, deactivate } from '../extension';
import { clearSessionArtifactsInMemoryCache } from '../sessionArtifacts';

suite('createSession command branch cache missing test', () => {
    let sandbox: sinon.SinonSandbox;
    let context: any;
    let commands: Map<string, (...args: any[]) => any>;

    setup(() => {
        sandbox = sinon.createSandbox();
        commands = new Map();
        clearSessionArtifactsInMemoryCache();

        sandbox.stub(vscode.commands, 'registerCommand').callsFake((cmd, callback) => {
            commands.set(cmd, callback);
            return { dispose: () => {} };
        });

        context = {
            globalState: {
                get: sandbox.stub().callsFake((key, defaultVal) => {
                    if (key === 'selected-source') return { id: 'test-source', name: 'Test Source' };
                    return defaultVal !== undefined ? defaultVal : {};
                }),
                update: sandbox.stub().resolves(),
                keys: sandbox.stub().returns([]) // Fix for Object.entries on undefined
            },
            secrets: {
                get: sandbox.stub().resolves('dummy-key'),
                store: sandbox.stub().resolves()
            },
            subscriptions: []
        };

        sandbox.stub(vscode.window, 'createTreeView').returns({ dispose: () => {}, onDidChangeSelection: () => ({ dispose: () => {} }) } as any);
        sandbox.stub(vscode.window, 'registerWebviewViewProvider').returns({ dispose: () => {} } as any);
    });

    teardown(() => {
        sandbox.restore();
        deactivate();
        clearSessionArtifactsInMemoryCache();
    });

    test('should re-fetch remote branches if selected branch is not in cached remote branches', async () => {
        activate(context as any);
        const createSessionCmd = commands.get('jules-extension.createSession');
        assert.ok(createSessionCmd);

        sandbox.stub(vscode.window, 'showInputBox').resolves('test-session');
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ label: 'feature-branch' } as any);

        const branchUtils = require('../branchUtils');
        const getBranchesStub = sandbox.stub(branchUtils, 'getBranchesForSession');

        getBranchesStub.onFirstCall().resolves({
            branches: ['main', 'feature-branch'],
            defaultBranch: 'main',
            currentBranch: 'main',
            remoteBranches: ['main'] // Triggers DA:3261
        });

        getBranchesStub.onSecondCall().resolves({
            branches: ['main', 'feature-branch'],
            defaultBranch: 'main',
            currentBranch: 'main',
            remoteBranches: ['main', 'feature-branch']
        });

        sandbox.stub(globalThis, 'fetch').resolves({ ok: true, json: async () => ({}) } as any);
        sandbox.stub(require('../sessionUtils'), 'createJulesSession').resolves({});
        sandbox.stub(require('../sessionArtifacts'), 'updateSessionArtifactsCache').resolves();

        await createSessionCmd();

        assert.strictEqual(getBranchesStub.callCount, 2);
    });
});
