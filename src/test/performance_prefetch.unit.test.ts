import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { JulesSessionsProvider } from '../extension';

// Helper to create a delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

suite('Performance Benchmark - Prefetch Blocking', () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;
    let contextStub: any;

    setup(() => {
        sandbox = sinon.createSandbox();

        // Mock context
        contextStub = {
            secrets: {
                get: sandbox.stub().resolves('mock-api-key')
            },
            globalState: {
                get: sandbox.stub().returns(undefined),
                update: sandbox.stub().resolves(),
                keys: sandbox.stub().returns([])
            },
            subscriptions: []
        };

        // Mock configuration
        const configStub = {
            get: sandbox.stub().callsFake((key: string) => {
                if (key === 'autoRefresh.enabled') return true;
                return undefined;
            })
        };
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(configStub as any);

        // Mock global.fetch
        // We need to cast global to any because fetch might not be in the type definition depending on tsconfig
        if (!global.fetch) {
            (global as any).fetch = () => {};
        }
        fetchStub = sandbox.stub(global, 'fetch');
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Benchmark: refresh() duration (non-blocking prefetch)', async () => {
        let prefetchResolved = false;

        // 1. Mock sessions response (Fast)
        const sessionsResponse = {
            ok: true,
            json: async () => ({
                sessions: [
                    { name: 'session1', title: 'Session 1', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' },
                    { name: 'session2', title: 'Session 2', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' },
                    { name: 'session3', title: 'Session 3', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' },
                    { name: 'session4', title: 'Session 4', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' },
                    { name: 'session5', title: 'Session 5', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' }
                ]
            })
        };

        // 2. Mock artifacts response (Slow)
        const artifactsResponse = {
            ok: true,
            json: async () => ({
                activities: []
            })
        };

        fetchStub.callsFake(async (url: string | URL | Request) => {
            const urlString = url.toString();
            if (urlString.endsWith('/sessions')) {
                // Simulate fast network for sessions list
                await delay(10);
                return sessionsResponse;
            } else if (urlString.includes('/activities')) {
                // Simulate slow network for artifacts prefetch
                await delay(200);
                prefetchResolved = true;
                return artifactsResponse;
            } else if (urlString.includes('/sources')) {
                return { ok: true, json: async () => ({ sources: [] }) };
            }
            return { ok: false, status: 404 };
        });

        const provider = new JulesSessionsProvider(contextStub);
        await provider.refresh(false, false);

        // Crucial Check:
        // refresh() should have returned *before* the slow artifact fetch (200ms) completed.
        // So prefetchResolved should still be false.
        assert.strictEqual(prefetchResolved, false, 'refresh() should return before artifact prefetch completes');

        // Wait for the background promise to eventually settle (cleanup)
        await delay(250);
        assert.strictEqual(prefetchResolved, true, 'Artifact prefetch should eventually complete in background');
    });
});
