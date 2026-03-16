import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as fetchUtils from "../fetchUtils";
import { createJulesSession } from "../sessionUtils";

suite("sessionUtils ユニットテスト", () => {
  let sandbox: sinon.SinonSandbox;
  let updateStub: sinon.SinonStub;
  let context: vscode.ExtensionContext;

  setup(() => {
    sandbox = sinon.createSandbox();
    updateStub = sandbox.stub().resolves();
    context = {
      globalState: {
        update: updateStub,
      },
    } as unknown as vscode.ExtensionContext;

    sandbox.stub(vscode.workspace, "getConfiguration").returns({
      get: (key: string, defaultValue?: unknown) => {
        if (key === "customPrompt") {
          return "Always include defensive checks.";
        }
        return defaultValue;
      },
    } as any);

    sandbox.stub(vscode.window, "showInformationMessage");
    sandbox
      .stub(vscode.window, "withProgress")
      .callsFake(async (_options, task) =>
        task({ report: () => {} } as any, {} as vscode.CancellationToken),
      );
  });

  teardown(() => {
    sandbox.restore();
  });

  test("createJulesSession は成功時にセッションIDを保存して返すこと", async () => {
    const fetchStub = sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
      ok: true,
      json: async () => ({ name: "sessions/abc123" }),
    } as any);

    const sessionName = await createJulesSession(
      context,
      { name: "sources/github/my-org/my-repo" } as any,
      "dummy-key",
      "feature/inline",
      "Refactor this function",
      "Refactor in sample.ts",
      "AUTO_CREATE_PR",
      true,
    );

    assert.strictEqual(sessionName, "sessions/abc123");
    assert.strictEqual(updateStub.calledOnceWithExactly("active-session-id", "sessions/abc123"), true);
    assert.strictEqual(fetchStub.calledOnce, true);

    const [url, options] = fetchStub.firstCall.args as [string, RequestInit];
    assert.strictEqual(url, "https://jules.googleapis.com/v1alpha/sessions");

    const body = JSON.parse(String(options.body));
    assert.strictEqual(body.sourceContext.source, "sources/github/my-org/my-repo");
    assert.strictEqual(body.sourceContext.githubRepoContext.startingBranch, "feature/inline");
    assert.strictEqual(body.prompt, "Refactor this function\n\nAlways include defensive checks.");
  });

  test("createJulesSession は非200レスポンスでエラーを投げること", async () => {
    sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as any);

    await assert.rejects(
      () =>
        createJulesSession(
          context,
          { name: "sources/github/my-org/my-repo" } as any,
          "dummy-key",
          "main",
          "prompt",
          "title",
          "MANUAL",
          false,
        ),
      /Failed to create session: 500 Internal Server Error/,
    );

    assert.strictEqual(updateStub.called, false);
  });

  test("createJulesSession はname欠落レスポンスでエラーを投げること", async () => {
    sandbox.stub(fetchUtils, "fetchWithTimeout").resolves({
      ok: true,
      json: async () => ({}),
    } as any);

    await assert.rejects(
      () =>
        createJulesSession(
          context,
          { name: "sources/github/my-org/my-repo" } as any,
          "dummy-key",
          "main",
          "prompt",
          "title",
          "MANUAL",
          false,
        ),
      /Invalid create session response: missing session name\./,
    );

    assert.strictEqual(updateStub.called, false);
  });
});
