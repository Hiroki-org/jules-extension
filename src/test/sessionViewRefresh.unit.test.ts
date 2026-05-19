import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { JulesSessionsProvider } from "../extension";

suite("JulesSessionsProvider Refresh Logic Unit Tests", () => {
  let sandbox: sinon.SinonSandbox;
  let mockContext: vscode.ExtensionContext;
  let provider: JulesSessionsProvider;
  let fireStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    fireStub = sandbox.stub();
    
    const globalStateGetStub = sandbox.stub();
    // Default returns for unrelated keys
    globalStateGetStub.withArgs("jules.prStatusCache", sinon.match.any).returns({});
    globalStateGetStub.withArgs("jules.previousSessionStates", sinon.match.any).returns({});
    globalStateGetStub.withArgs("jules-extension.hideClosedPRSessions", sinon.match.any).returns(false);

    mockContext = {
      globalState: {
        get: globalStateGetStub,
        update: sandbox.stub().resolves(),
      },
      secrets: {
        get: sandbox.stub().resolves("fake-api-key"),
      },
      extensionMode: vscode.ExtensionMode.Test,
      subscriptions: [],
    } as any;

    provider = new JulesSessionsProvider(mockContext);
    // @ts-ignore - access private property for testing
    provider._onDidChangeTreeData = { fire: fireStub } as any;
  });

  teardown(() => {
    sandbox.restore();
  });

  test("should trigger UI update when source changes even if sessions remain the same", async () => {
    const fetchStub = sandbox.stub(global, "fetch" as any);
    
    // Mock sessions API response
    const mockSessions = {
      sessions: [
        { name: "sessions/s1", title: "Session 1", state: "RUNNING" }
      ]
    };
    fetchStub.resolves({
      ok: true,
      json: async () => mockSessions,
    } as any);

    // 1. Initial fetch with Source A
    (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "source-a" });
    
    await provider.refresh();
    assert.strictEqual(fireStub.calledOnce, true, "Should fire on initial load");
    fireStub.resetHistory();

    // 2. Second fetch with same Source A and same sessions
    await provider.refresh();
    assert.strictEqual(fireStub.called, false, "Should NOT fire when nothing changed");

    // 3. Third fetch with DIFFERENT Source B but SAME sessions
    (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "source-b" });
    
    await provider.refresh();
    assert.strictEqual(fireStub.calledOnce, true, "Should fire when source changed");
  });

  test("should refresh the tree when only source changed", async () => {
    const fetchStub = sandbox.stub(global, "fetch" as any);
    
    const mockSessions = { sessions: [] };
    fetchStub.resolves({
      ok: true,
      json: async () => mockSessions,
    } as any);

    // Initial
    (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "source-a" });
    await provider.refresh();
    fireStub.resetHistory();

    // Change source
    (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "source-b" });
    await provider.refresh();
    
    assert.strictEqual(fireStub.calledOnce, true);
  });

  test("should trigger UI update when forceUIUpdate is true even if sessions and source are same", async () => {
    const fetchStub = sandbox.stub(global, "fetch" as any);
    
    const mockSessions = { sessions: [] };
    fetchStub.resolves({
      ok: true,
      json: async () => mockSessions,
    } as any);

    (mockContext.globalState.get as sinon.SinonStub).withArgs("selected-source").returns({ id: "source-a" });
    await provider.refresh(); // initial load
    fireStub.resetHistory();

    await provider.refresh(false, true); // forceUIUpdate = true
    assert.strictEqual(fireStub.calledOnce, true, "Should fire when forceUIUpdate is true");
  });
});
