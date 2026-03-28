import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { buildFinalPrompt } from "../promptUtils";

const JAPANESE_INSTRUCTION =
  "Please use Japanese for all GitHub interactions (PR titles, descriptions, commit messages, and review replies).";

suite("promptUtils", () => {
  let getConfigurationStub: sinon.SinonStub;

  setup(() => {
    getConfigurationStub = sinon.stub(vscode.workspace, "getConfiguration");
  });

  teardown(() => {
    getConfigurationStub.restore();
  });

  function makeConfig(opts: { customPrompt?: string; enforceJapanese?: boolean }) {
    return {
      get: sinon.stub().callsFake((key: string, def: unknown) => {
        if (key === "customPrompt") {
          return opts.customPrompt ?? def;
        }
        if (key === "enforceJapanese") {
          return opts.enforceJapanese ?? def;
        }
        return def;
      }),
    };
  }

  test("enforceJapanese=true appends Japanese instruction", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: "", enforceJapanese: true }));

    const result = buildFinalPrompt("Do something");
    assert.strictEqual(result, `Do something\n\n${JAPANESE_INSTRUCTION}`);
  });

  test("enforceJapanese=false returns base prompt without Japanese instruction", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: "", enforceJapanese: false }));

    const result = buildFinalPrompt("Do something");
    assert.strictEqual(result, "Do something");
    assert.ok(!result.includes(JAPANESE_INSTRUCTION));
  });

  test("custom prompt is prepended when enforceJapanese=true", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: "Always be concise.", enforceJapanese: true }));

    const result = buildFinalPrompt("Explain this");
    assert.strictEqual(
      result,
      `Always be concise.\n\nExplain this\n\n${JAPANESE_INSTRUCTION}`,
    );
  });

  test("custom prompt is prepended when enforceJapanese=false", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: "Always be concise.", enforceJapanese: false }));

    const result = buildFinalPrompt("Explain this");
    assert.strictEqual(result, "Always be concise.\n\nExplain this");
    assert.ok(!result.includes(JAPANESE_INSTRUCTION));
  });

  test("empty custom prompt is ignored", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: "", enforceJapanese: false }));

    const result = buildFinalPrompt("Simple prompt");
    assert.strictEqual(result, "Simple prompt");
  });

  test("undefined custom prompt is treated as empty", () => {
    getConfigurationStub
      .withArgs("jules-extension")
      .returns(makeConfig({ customPrompt: undefined, enforceJapanese: false }));

    const result = buildFinalPrompt("Simple prompt");
    assert.strictEqual(result, "Simple prompt");
  });
});
