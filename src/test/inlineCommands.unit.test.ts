import * as assert from "assert";
import { JulesCodeActionProvider } from "../inlineCommands";

suite("inlineCommands ユニットテスト", () => {
  test("JulesCodeActionProvider は Refactor と Generate Tests の2アクションを返す", () => {
    const provider = new JulesCodeActionProvider();
    const actions = provider.provideCodeActions(
      { uri: { toString: () => "file:///tmp/sample.ts" } } as any,
      { isEmpty: false } as any,
      {} as any,
      {} as any,
    );

    assert.ok(actions);
    assert.strictEqual(actions!.length, 2);
    assert.strictEqual((actions![0] as any).kind.value, "refactor");
    assert.strictEqual((actions![1] as any).kind.value, "jules.generateTests");
    assert.strictEqual(actions![1].command?.command, "jules-extension.inlineGenerateTests");
  });

  test("JulesCodeActionProvider は空選択では undefined を返す", () => {
    const provider = new JulesCodeActionProvider();
    const actions = provider.provideCodeActions(
      { uri: { toString: () => "file:///tmp/sample.ts" } } as any,
      { isEmpty: true } as any,
      {} as any,
      {} as any,
    );

    assert.strictEqual(actions, undefined);
  });
});
