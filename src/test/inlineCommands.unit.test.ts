import * as assert from "assert";
import * as vscode from "vscode";
import { JulesCodeActionProvider, buildInlineTaskPrompt } from "../inlineCommands";

suite("inlineCommands Test Suite", () => {
    test("JulesCodeActionProvider returns actions for non-empty range", () => {
        const provider = new JulesCodeActionProvider();
        const doc = { uri: vscode.Uri.parse("file:///test.ts") } as any;
        const range = new vscode.Range(0, 0, 0, 10);
        const context = {} as any;
        const token = { isCancellationRequested: false } as any;

        const actions = provider.provideCodeActions(doc, range, context, token);
        assert.ok(actions);
        assert.strictEqual(actions!.length, 2);
        assert.strictEqual(actions![0].title, "Jules: Refactor Selection");
        assert.strictEqual(actions![1].title, "Jules: Generate Tests for Selection");
    });

    test("JulesCodeActionProvider returns undefined for empty range", () => {
        const provider = new JulesCodeActionProvider();
        const doc = {} as any;
        const range = new vscode.Range(0, 0, 0, 0);
        const context = {} as any;
        const token = {} as any;

        const actions = provider.provideCodeActions(doc, range, context, token);
        assert.strictEqual(actions, undefined);
    });

    test("buildInlineTaskPrompt should use a safe fence length for snippets with backticks", () => {
        const codeSnippet = "const x = `hello`;\n```\ninner\n```";
        const prompt = buildInlineTaskPrompt("Generate Tests", "test.ts", "typescript", codeSnippet);

        // Should include "for"
        assert.ok(prompt.includes("generate tests for the following code"));

        // Check for safe fencing (should be more than 3 backticks)
        const openingFenceMatch = prompt.match(/\n(`{4,})typescript\n/);
        assert.ok(openingFenceMatch, "Should have a fence with at least 4 backticks");
        const fence = openingFenceMatch![1];
        assert.ok(prompt.includes(`\n${fence}\n`));
    });
});
