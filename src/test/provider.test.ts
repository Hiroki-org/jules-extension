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
});
