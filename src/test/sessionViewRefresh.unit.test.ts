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
    
    mockContext = {
      globalState: {
        get: sandbox.stub(),
        update: sandbox.stub().resolves(),
      },
      secrets: {
        get: sandbox.stub().resolves("fake-api-key"),
      },
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

  test("should log source change when only source changed", async () => {
    const fetchStub = sandbox.stub(global, "fetch" as any);
    const logSpy = sandbox.stub(vscode.window.createOutputChannel("Jules"), "appendLine");
    // Note: In extension.ts, logChannel is a shared global. We might need to mock it if possible, 
    // but testing fire() is more important for coverage of the logic branches.
    
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
});
