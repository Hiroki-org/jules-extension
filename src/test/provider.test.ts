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

    test("syncSelectedSessionActivitiesAndProgress should conditionally fetch based on updateTime and emit onDidFetchActivities", async () => {
        const provider = new JulesSessionsProvider(mockContext);
        let eventFired = false;
        provider.onDidFetchActivities(() => {
            eventFired = true;
        });

        provider.setLastSelectedSessionId("session-1");
        
        // Mock fetch for activities
        fetchStub.resolves({
            ok: true,
            json: async () => ({ activities: [{ id: 1 }] })
        });
        
        const sessions: any = [{ name: "session-1", state: "IN_PROGRESS", updateTime: "time1", title: "Test", createTime: "time1", rawState: "IN_PROGRESS" }];
        
        // First sync -> Should fetch and fire event
        await (provider as any).syncSelectedSessionActivitiesAndProgress("fake-api-key", sessions);
        assert.strictEqual(eventFired, true, "Event should fire on first sync");
        
        eventFired = false;
        
        // Second sync with same updateTime -> Should skip fetch and NOT fire event
        await (provider as any).syncSelectedSessionActivitiesAndProgress("fake-api-key", sessions);
        assert.strictEqual(eventFired, false, "Event should NOT fire when updateTime is unchanged");
        
        // Third sync with new updateTime -> Should fetch and fire event
        sessions[0].updateTime = "time2";
        await (provider as any).syncSelectedSessionActivitiesAndProgress("fake-api-key", sessions);
        assert.strictEqual(eventFired, true, "Event should fire when updateTime is changed");
    });
});

