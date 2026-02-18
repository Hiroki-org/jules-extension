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
            get: sandbox.stub().returns(true) // autoRefresh.enabled
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

    test('Benchmark: refresh() duration', async () => {
        // 1. Mock sessions response (Fast)
        const sessionsResponse = {
            ok: true,
            json: async () => ({
                sessions: [
                    { name: 'session1', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' },
                    { name: 'session2', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' },
                    { name: 'session3', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' },
                    { name: 'session4', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' },
                    { name: 'session5', state: 'RUNNING', updateTime: '2023-01-01T00:00:00Z' }
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
                return artifactsResponse;
            } else if (urlString.includes('/sources')) {
                return { ok: true, json: async () => ({ sources: [] }) };
            }
            return { ok: false, status: 404 };
        });

        const provider = new JulesSessionsProvider(contextStub);

        const startTime = Date.now();
        await provider.refresh(false, false);
        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`Refresh duration: ${duration}ms`);

        // Ensure refresh is non-blocking (significantly less than the 200ms artifact fetch delay)
        // With overhead, it should be well under 150ms (typically < 20ms)
        assert.ok(duration < 150, `Expected < 150ms (async prefetch), but got ${duration}ms`);
    });
});
