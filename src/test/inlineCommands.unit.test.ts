import * as assert from "assert";
import * as vscode from "vscode";
import { JulesCodeActionProvider } from "../inlineCommands";

suite("inlineCommands Test Suite", () => {
    test("JulesCodeActionProvider returns actions for non-empty range", () => {
        const provider = new JulesCodeActionProvider();
        const doc = { uri: vscode.Uri.parse("file:///test.ts") } as any;
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10));

        const actions = provider.provideCodeActions(doc, range, {} as any, {} as any);

        assert.ok(actions);
        assert.strictEqual(actions?.length, 2);
        assert.strictEqual(actions[0].title, "Jules: Refactor Selection");
        assert.strictEqual(actions[0].kind?.value, "refactor");
        assert.strictEqual(actions[1].title, "Jules: Generate Tests for Selection");
        assert.strictEqual(actions[1].kind?.value, "refactor.jules.generateTests");
    });

    test("JulesCodeActionProvider returns undefined for empty range", () => {
        const provider = new JulesCodeActionProvider();
        const doc = { uri: vscode.Uri.parse("file:///test.ts") } as any;
        const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));

        const actions = provider.provideCodeActions(doc, range, {} as any, {} as any);

        assert.strictEqual(actions, undefined);
    });
});
