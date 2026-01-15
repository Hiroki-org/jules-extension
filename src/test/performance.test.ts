
import * as assert from "assert";
import * as vscode from "vscode";
import { updatePreviousStates } from "../extension";
import { Session } from "../types";
import * as sinon from "sinon";

suite("Performance Tests", () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let fetchStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        mockContext = {
            globalState: {
                get: sandbox.stub().returns({}),
                update: sandbox.stub().resolves(),
                keys: sandbox.stub().returns([]),
            },
            secrets: {
                get: sandbox.stub().resolves("dummy-token"),
            }
        } as any;

        // Mock fetch with a delay to simulate network latency
        fetchStub = sandbox.stub(global, 'fetch');
        fetchStub.callsFake(async () => {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms latency
            return {
                ok: true,
                json: async () => ({ state: "closed" })
            } as any;
        });
    });

    teardown(() => {
        sandbox.restore();
    });

    test("updatePreviousStates should be performant with multiple PR checks", async () => {
        // Create 5 completed sessions with PRs
        // Using fewer sessions to keep test fast, but enough to show difference
        const sessions: Session[] = Array.from({ length: 5 }, (_, i) => ({
            name: `session-${i}`,
            title: `Session ${i}`,
            state: "COMPLETED",
            rawState: "COMPLETED",
            outputs: [{
                pullRequest: {
                    url: `https://github.com/owner/repo/pull/${i}`,
                    title: "PR",
                    description: "desc"
                }
            }]
        }));

        const start = Date.now();
        await updatePreviousStates(sessions, mockContext);
        const duration = Date.now() - start;

        // If sequential: 5 * 100ms = 500ms
        // If parallel: ~100ms (plus overhead)

        console.log(`Performance test duration: ${duration}ms`);

        // This assertion will fail initially if it's sequential (expected > 500ms)
        // I'll set a threshold that requires parallelism.
        // 5 * 100 = 500ms. Parallel should be around 100-200ms.
        // Let's be generous and say < 300ms.
        assert.ok(duration < 400, `Expected < 400ms (parallel), but got ${duration}ms (sequential?)`);
    });
});
