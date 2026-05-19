import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { buildFinalPrompt } from "../promptUtils";

suite("promptUtils", () => {
  let getConfigurationStub: sinon.SinonStub;

  setup(() => {
    getConfigurationStub = sinon.stub(vscode.workspace, "getConfiguration");
  });

  teardown(() => {
    getConfigurationStub.restore();
  });

  function makeConfig(opts: { customPrompt?: string }) {
    return {
      get: sinon.stub().callsFake((key: string, def: unknown) => {
        if (key === "customPrompt") {
          return opts.customPrompt ?? def;
        }
        return def;
      }),
    };
  }

  test("base prompt is returned when customPrompt is empty", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: "" }));

    const result = buildFinalPrompt("Do something");
    assert.strictEqual(result, "Do something");
  });

  test("custom prompt is prepended when provided", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: "Always be concise." }));

    const result = buildFinalPrompt("Explain this");
    assert.strictEqual(result, "Always be concise.\n\nExplain this");
  });

  test("undefined custom prompt is treated as empty", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: undefined }));

    const result = buildFinalPrompt("Simple prompt");
    assert.strictEqual(result, "Simple prompt");
  });
});
