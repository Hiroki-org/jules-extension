import * as assert from "assert";
import * as vscode from "vscode";
import { JulesSessionsProvider } from "../extension";
import * as sinon from "sinon";

suite("JulesSessionsProvider Test Suite", () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let fetchStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        mockContext = {
            globalState: {
                get: sandbox.stub(),
                update: sandbox.stub().resolves(),
            },
            subscriptions: [],
            secrets: {
                get: sandbox.stub().resolves('fake-api-key'),
            }
        } as any;
        fetchStub = sandbox.stub(global, 'fetch');
    });

    teardown(() => {
        sandbox.restore();
    });

    test("getChildren should return empty array when no source selected", async () => {
        (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns(undefined);

        const provider = new JulesSessionsProvider(mockContext);
        const children = await provider.getChildren();

        assert.deepStrictEqual(children, [], "Should return empty array when no source selected");
    });

    test("getChildren should return empty array when source selected but no sessions found", async () => {
        (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ name: "source1" });

        // Mock fetch to return empty sessions
        fetchStub.resolves({
            ok: true,
            json: async () => ({ sessions: [] })
        });

        const provider = new JulesSessionsProvider(mockContext);
        const children = await provider.getChildren();

        assert.deepStrictEqual(children, [], "Should return empty array when sessions list is empty");
    });

    suite("Filtering and Fast Path Logic", () => {
        let provider: JulesSessionsProvider;
        let mockSessions: any[];
        let getConfigurationStub: sinon.SinonStub;
        let extensionModule: any;

        setup(() => {
            provider = new JulesSessionsProvider(mockContext);
            mockSessions = [
                { name: "session1", sourceContext: { source: "repoA" } },
                { name: "session2", sourceContext: { source: "repoB" } },
                { name: "session3", sourceContext: { source: "repoA" } },
            ];
            (provider as any).sessionsCache = mockSessions;

            getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');

            // Re-import the module to manipulate unexported variable via rewire if needed,
            // but since previousSessionStates is unexported, we can mock it by injecting
            // a Map directly into the extension module if possible, OR by bypassing it.
            // A better way is to mock globalState since previousSessionStates is loaded from globalState
            // but loadPreviousSessionStates is called on activation.
            // Let's use rewire pattern to mock unexported if we can, or just mock vscode.workspace.
            // However, previousSessionStates is an unexported variable in extension.ts.
            // In unit tests, previousSessionStates will be initialized to an empty Map or what's in mockContext.
            // Let's re-initialize it via mockContext if possible.
        });

        teardown(() => {
            // Important: we need to reset the unexported previousSessionStates map.
            // Since we can't access it directly, we will use mockContext to trigger a reset
            // if we could. Let's just use rewire via another method, or we mock it directly.
        });

        test("should use fast path when ALL_SOURCES_ID is selected and hideClosedPRSessions is false", async () => {
            (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "all_repos" });
            getConfigurationStub.returns({
                get: sandbox.stub().withArgs("hideClosedPRSessions").returns(false)
            });

            const children = await provider.getChildren();
            assert.strictEqual(children.length, 3);
            // Verify TreeItems wrap the sessions correctly
            assert.strictEqual((children as any)[0].session.name, "session1");
        });

        test("should apply both filters without failing", async () => {
             (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ name: "repoA" });
            getConfigurationStub.returns({
                get: sandbox.stub().withArgs("hideClosedPRSessions").returns(true)
            });

            const children = await provider.getChildren();
            // Since we can't reliably mock previousSessionStates which is unexported,
            // the state won't contain `isTerminated: true` for any mock session unless it happens to be saved.
            // By default `isTerminated` is undefined, meaning they will be kept.
            // So repoA sessions (session1, session3) will be kept.
            assert.strictEqual(children.length, 2);
            assert.strictEqual((children as any)[0].session.name, "session1");
        });
    });
});
