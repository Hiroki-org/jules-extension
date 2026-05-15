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
        let extensionModule = require('../extension');

        setup(() => {
            provider = new JulesSessionsProvider(mockContext);
            mockSessions = [
                { name: "session1", sourceContext: { source: "repoA" } },
                { name: "session2", sourceContext: { source: "repoB" } },
                { name: "session3", sourceContext: { source: "repoA" } },
            ];
            (provider as any).sessionsCache = mockSessions;

            getConfigurationStub = sandbox.stub(vscode.workspace, 'getConfiguration');

            // Clear the previousSessionStates map before each test
            extensionModule.setPreviousSessionStatesForTests(new Map());
        });

        teardown(() => {
            extensionModule.setPreviousSessionStatesForTests(new Map());
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

        test("should filter out terminated PRs when ALL_SOURCES_ID is selected and hideClosedPRSessions is true", async () => {
            (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "all_repos" });
            getConfigurationStub.returns({
                get: sandbox.stub().withArgs("hideClosedPRSessions").returns(true)
            });

            const states = new Map();
            states.set("session2", { isTerminated: true });
            extensionModule.setPreviousSessionStatesForTests(states);

            const children = await provider.getChildren();
            assert.strictEqual(children.length, 2);
            assert.strictEqual((children as any)[0].session.name, "session1");
            assert.strictEqual((children as any)[1].session.name, "session3");
        });

        test("previousSessionStates未ロード時はglobalStateから復元してterminatedを除外する", async () => {
            extensionModule.resetUpdatePreviousStatesCachesForTests();
            (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "all_repos" });
            (mockContext.globalState.get as sinon.SinonStub).withArgs("jules.previousSessionStates", {}).returns({
                session2: { name: "session2", state: "COMPLETED", rawState: "COMPLETED", isTerminated: true }
            });
            getConfigurationStub.returns({
                get: sandbox.stub().withArgs("hideClosedPRSessions").returns(true)
            });

            const children = await provider.getChildren();
            assert.strictEqual(children.length, 2);
            assert.strictEqual((children as any)[0].session.name, "session1");
            assert.strictEqual((children as any)[1].session.name, "session3");
        });

        test("should filter by specific source and not hide closed PRs if hideClosedPRSessions is false", async () => {
            (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ name: "repoA" });
            getConfigurationStub.returns({
                get: sandbox.stub().withArgs("hideClosedPRSessions").returns(false)
            });

            const states = new Map();
            states.set("session1", { isTerminated: true }); // Should not be filtered out because hideClosedPRs is false
            extensionModule.setPreviousSessionStatesForTests(states);

            const children = await provider.getChildren();
            assert.strictEqual(children.length, 2);
            assert.strictEqual((children as any)[0].session.name, "session1");
            assert.strictEqual((children as any)[1].session.name, "session3");
        });

        test("should apply both source filter and terminated PR filter simultaneously", async () => {
            (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ name: "repoA" });
            getConfigurationStub.returns({
                get: sandbox.stub().withArgs("hideClosedPRSessions").returns(true)
            });

            const states = new Map();
            states.set("session1", { isTerminated: true }); // Filtered by hideClosedPRs
            extensionModule.setPreviousSessionStatesForTests(states);
            // session2 is filtered by source ("repoB")
            // session3 is kept

            const children = await provider.getChildren();
            assert.strictEqual(children.length, 1);
            assert.strictEqual((children as any)[0].session.name, "session3");
        });

        test("should execute ALL_SOURCES_ID block when hideClosedPRSessions is true, to cover else block logging", async () => {
            (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "all_repos" });
            getConfigurationStub.returns({
                get: sandbox.stub().withArgs("hideClosedPRSessions").returns(true)
            });
            const states = new Map();
            // Make session1 terminated so `terminatedFilteredCount > 0` condition is hit
            // and `sourceFilteredCount++` in the else block is hit.
            states.set("session1", { isTerminated: true });
            extensionModule.setPreviousSessionStatesForTests(states);

            const children = await provider.getChildren();
            assert.strictEqual(children.length, 2);
            assert.strictEqual((children as any)[0].session.name, "session2");
            assert.strictEqual((children as any)[1].session.name, "session3");
        });

        test("should trigger specific source not matching branch and logging branches", async () => {
            // Selected source is "repoB". session1 and session3 are "repoA", so they will be filtered out (`keep = false`)
            (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ name: "repoB" });
            getConfigurationStub.returns({
                get: sandbox.stub().withArgs("hideClosedPRSessions").returns(true)
            });

            // For session2 (which matches "repoB"), we mark it as terminated.
            // This will increment terminatedFilteredCount.
            const states = new Map();
            states.set("session2", { isTerminated: true });
            extensionModule.setPreviousSessionStatesForTests(states);

            const children = await provider.getChildren();
            // session1 -> keep=false (repo mismatch)
            // session2 -> keep=false (terminated)
            // session3 -> keep=false (repo mismatch)
            // Result should be 0, covering lines that weren't hit yet.
            assert.strictEqual(children.length, 0);
        });
    });
});
