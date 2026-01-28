
import * as assert from "assert";
import * as vscode from "vscode";
import { updatePreviousStates, Session } from "../extension";
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
        // Create 10 completed sessions with PRs to clearly distinguish parallel vs sequential
        // Sequential: 10 * 100ms = 1000ms
        // Parallel: ~100ms + overhead (should be well under 600ms)
        const sessions: Session[] = Array.from({ length: 10 }, (_, i) => ({
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

        console.log(`Performance test duration: ${duration}ms`);

        // Sequential execution would be > 1000ms.
        // Parallel execution should be significantly faster.
        // We set the threshold to 800ms to allow plenty of CI overhead buffer
        // while still strictly failing for sequential execution.
        assert.ok(duration < 800, `Expected < 800ms (parallel), but got ${duration}ms (sequential?)`);
    });
});
