import * as assert from "assert";
import * as vscode from "vscode";
import {
    JulesSessionsProvider,
    setPreviousSessionStatesForTests,
    resetUpdatePreviousStatesCachesForTests,
    SessionTreeItem
} from "../extension";
import { ALL_SOURCES_ID } from "../julesApiConstants";
import * as sinon from "sinon";

suite("JulesSessionsProvider getChildren Test Suite", () => {
    let sandbox: sinon.SinonSandbox;
    let mockContext: vscode.ExtensionContext;
    let getConfigurationStub: sinon.SinonStub;

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

        getConfigurationStub = sandbox.stub(vscode.workspace, "getConfiguration");
        resetUpdatePreviousStatesCachesForTests();
    });

    teardown(() => {
        sandbox.restore();
        resetUpdatePreviousStatesCachesForTests();
    });

    function createMockSession(name: string, source: string) {
        return {
            name,
            title: `Title ${name}`,
            state: "RUNNING",
            rawState: "IN_PROGRESS",
            sourceContext: { source }
        } as any;
    }

    test("getChildren should return all sessions (Fast Path: All Sources, hideClosedPRs=false)", async () => {
        const sessions = [
            createMockSession("s1", "repo1"),
            createMockSession("s2", "repo2")
        ];

        const globalStateGet = mockContext.globalState.get as sinon.SinonStub;
        globalStateGet.withArgs("selected-source").returns({ id: ALL_SOURCES_ID, name: "All repositories" });

        getConfigurationStub.returns({
            get: (key: string) => {
                if (key === "hideClosedPRSessions") { return false; }
                return undefined;
            }
        } as any);

        const provider = new JulesSessionsProvider(mockContext);
        provider.setSessionsCacheForTests(sessions);

        const children = await provider.getChildren();

        assert.strictEqual(children.length, 2);
        assert.ok(children[0] instanceof SessionTreeItem);
        assert.strictEqual((children[0] as SessionTreeItem).label, "Title s1");
        assert.strictEqual((children[1] as SessionTreeItem).label, "Title s2");
    });

    test("getChildren should filter by source", async () => {
        const sessions = [
            createMockSession("s1", "repo1"),
            createMockSession("s2", "repo2"),
            createMockSession("s3", "repo1")
        ];

        const globalStateGet = mockContext.globalState.get as sinon.SinonStub;
        globalStateGet.withArgs("selected-source").returns({ id: "repo1-id", name: "repo1" });

        getConfigurationStub.returns({
            get: (key: string) => {
                if (key === "hideClosedPRSessions") { return false; }
                return undefined;
            }
        } as any);

        const provider = new JulesSessionsProvider(mockContext);
        provider.setSessionsCacheForTests(sessions);

        const children = await provider.getChildren();

        assert.strictEqual(children.length, 2);
        assert.strictEqual((children[0] as SessionTreeItem).label, "Title s1");
        assert.strictEqual((children[1] as SessionTreeItem).label, "Title s3");
    });

    test("getChildren should filter out terminated sessions when hideClosedPRs=true", async () => {
        const sessions = [
            createMockSession("s1", "repo1"),
            createMockSession("s2", "repo1"),
            createMockSession("s3", "repo1")
        ];

        const globalStateGet = mockContext.globalState.get as sinon.SinonStub;
        globalStateGet.withArgs("selected-source").returns({ id: ALL_SOURCES_ID, name: "All repositories" });

        getConfigurationStub.returns({
            get: (key: string) => {
                if (key === "hideClosedPRSessions") { return true; }
                return undefined;
            }
        } as any);

        // Mark s2 as terminated
        const previousStates = new Map();
        previousStates.set("s2", { isTerminated: true });
        setPreviousSessionStatesForTests(previousStates);

        const provider = new JulesSessionsProvider(mockContext);
        provider.setSessionsCacheForTests(sessions);

        const children = await provider.getChildren();

        assert.strictEqual(children.length, 2);
        assert.strictEqual((children[0] as SessionTreeItem).label, "Title s1");
        assert.strictEqual((children[1] as SessionTreeItem).label, "Title s3");
    });

    test("getChildren should filter both by source and terminated status in one pass", async () => {
        const sessions = [
            createMockSession("s1", "repo1"), // Keep
            createMockSession("s2", "repo1"), // Terminated
            createMockSession("s3", "repo2"), // Wrong source
            createMockSession("s4", "repo1")  // Keep
        ];

        const globalStateGet = mockContext.globalState.get as sinon.SinonStub;
        globalStateGet.withArgs("selected-source").returns({ id: "repo1-id", name: "repo1" });

        getConfigurationStub.returns({
            get: (key: string) => {
                if (key === "hideClosedPRSessions") { return true; }
                return undefined;
            }
        } as any);

        // Mark s2 as terminated
        const previousStates = new Map();
        previousStates.set("s2", { isTerminated: true });
        setPreviousSessionStatesForTests(previousStates);

        const provider = new JulesSessionsProvider(mockContext);
        provider.setSessionsCacheForTests(sessions);

        const children = await provider.getChildren();

        assert.strictEqual(children.length, 2);
        assert.strictEqual((children[0] as SessionTreeItem).label, "Title s1");
        assert.strictEqual((children[1] as SessionTreeItem).label, "Title s4");
    });
});
