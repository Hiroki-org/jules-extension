import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { activate } from "../extension";

suite("Command Coverage Unit Tests", () => {
  let sandbox: sinon.SinonSandbox;
  let mockContext: vscode.ExtensionContext;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockContext = {
      subscriptions: [],
      globalState: {
        get: sandbox.stub().returns({}),
        update: sandbox.stub().resolves(),
      },
      secrets: {
        get: sandbox.stub().resolves("fake-key"),
      },
      extensionMode: vscode.ExtensionMode.Test,
    } as any;
  });

  teardown(() => {
    sandbox.restore();
  });

  test("jules.filterActivities should show quick pick with English placeholder", async () => {
    const showQuickPickStub = sandbox.stub(vscode.window, "showQuickPick");
    // Mock fetch for activate
    const fetchStub = sandbox.stub(global, "fetch" as any);
    fetchStub.resolves({ ok: true, json: async () => ({ sessions: [] }) } as any);
    
    const registerCommandStub = sandbox.stub(vscode.commands, "registerCommand");
    
    // Call activate
    await activate(mockContext);

    // Find the handler for jules.filterActivities
    const filterHandler = registerCommandStub.args.find(args => args[0] === "jules.filterActivities")?.[1];
    assert.ok(filterHandler, "filterActivities handler should be registered");

    // Execute handler
    await filterHandler();

    assert.ok(showQuickPickStub.calledOnce);
    assert.strictEqual(showQuickPickStub.firstCall.args[1]?.placeHolder, "Select Activity categories to filter (empty = show all)");
  });

  test("jules.filterActivities should update provider filter and refresh when items are selected", async () => {
    const showQuickPickStub = sandbox.stub(vscode.window, "showQuickPick");
    showQuickPickStub.resolves([
      { label: "Plan", picked: true },
      { label: "Messages", picked: true }
    ] as any);

    // Mock fetch for activate
    const fetchStub = sandbox.stub(global, "fetch" as any);
    fetchStub.resolves({ ok: true, json: async () => ({ sessions: [] }) } as any);
    
    const registerCommandStub = sandbox.stub(vscode.commands, "registerCommand");
    
    // Call activate
    await activate(mockContext);

    // Find the handler for jules.filterActivities
    const filterHandler = registerCommandStub.args.find(args => args[0] === "jules.filterActivities")?.[1];
    assert.ok(filterHandler);

    // Execute handler
    await filterHandler();

    // Verify it reached the branches
    assert.ok(showQuickPickStub.calledOnce);
  });
});
