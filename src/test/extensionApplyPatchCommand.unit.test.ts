import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { activate, deactivate, Session, SessionTreeItem } from '../extension';
import * as applyPatch from '../applyPatchLocally';
import * as fetchUtils from '../fetchUtils';
import * as sessionArtifacts from '../sessionArtifacts';
import {
    ChangeSetSummary,
    clearSessionArtifactsInMemoryCache,
} from '../sessionArtifacts';

suite('applyPatchLocally command ユニットテスト', () => {
    let sandbox: sinon.SinonSandbox;
    let commands: Map<string, (...args: any[]) => unknown>;
    let context: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();
        commands = new Map();
        clearSessionArtifactsInMemoryCache();

        sandbox.stub(vscode.commands, 'registerCommand').callsFake((command: string, callback: (...args: any[]) => unknown) => {
            commands.set(command, callback);
            return { dispose: () => undefined } as any;
        });
        sandbox.stub(vscode.window, 'createTreeView').returns({
            dispose: () => undefined,
            onDidChangeSelection: () => ({ dispose: () => undefined }),
        } as any);
        sandbox.stub(vscode.window, 'registerWebviewViewProvider').returns({
            dispose: () => undefined,
        } as any);
        sandbox.stub(fetchUtils, 'fetchWithTimeout').resolves({
            ok: true,
            json: async () => ({ sessions: [] }),
        } as any);

        context = {
            globalState: {
                get: sandbox.stub().callsFake((_key: string, defaultValue?: unknown) => defaultValue),
                update: sandbox.stub().resolves(),
                keys: sandbox.stub().returns([]),
            },
            secrets: {
                get: sandbox.stub().resolves('api-key'),
                store: sandbox.stub().resolves(),
            },
            subscriptions: [],
        } as any;
    });

    teardown(() => {
        for (const subscription of context.subscriptions) {
            subscription.dispose();
        }
        deactivate();
        clearSessionArtifactsInMemoryCache();
        sandbox.restore();
    });

    function createSession(): Session {
        return {
            name: 'sessions/apply-command',
            title: 'Apply command',
            state: 'COMPLETED',
            rawState: 'COMPLETED',
        };
    }

    function createChangeSet(): ChangeSetSummary {
        return {
            files: [],
            raw: {
                gitPatch: {
                    unidiffPatch: 'diff --git a/file.ts b/file.ts',
                },
            },
        };
    }

    test('item がない場合は何もしないこと', async () => {
        const applyStub = sandbox.stub(applyPatch, 'applyPatchLocallyForSession').resolves();

        activate(context);
        const handler = commands.get('jules-extension.applyPatchLocally');
        assert.ok(handler, 'applyPatchLocally command should be registered');

        await handler();

        assert.strictEqual(applyStub.called, false);
    });

    test('cached ChangeSet に patch がない場合は最新 artifacts を再取得してから適用すること', async () => {
        const changeSet = createChangeSet();
        sandbox.stub(sessionArtifacts, 'fetchLatestSessionArtifacts').resolves({
            latestChangeSet: changeSet,
        });
        const applyStub = sandbox.stub(applyPatch, 'applyPatchLocallyForSession').resolves();

        activate(context);
        const handler = commands.get('jules-extension.applyPatchLocally');
        assert.ok(handler, 'applyPatchLocally command should be registered');

        const item = new SessionTreeItem(createSession());
        await handler(item);

        assert.strictEqual(applyStub.calledOnce, true);
        assert.strictEqual(applyStub.firstCall.args[0].changeSet, changeSet);
        assert.strictEqual(applyStub.firstCall.args[0].session, item.session);
    });
});
