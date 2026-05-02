import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
    JulesCodeActionProvider,
    JulesCodeLensProvider,
    buildInlineTaskPrompt,
    handleInlineTask,
    registerInlineCommands,
} from "../inlineCommands";
import * as branchUtils from "../branchUtils";
import * as composer from "../composer";
import * as sessionUtils from "../sessionUtils";
import { ALL_SOURCES_ID } from "../julesApiConstants";

suite("inlineCommands Test Suite", () => {
    let sandbox: sinon.SinonSandbox;
    let originalGetWorkspaceFolder: unknown;

    setup(() => {
        sandbox = sinon.createSandbox();
        originalGetWorkspaceFolder = (vscode.workspace as any).getWorkspaceFolder;
    });

    teardown(() => {
        sandbox.restore();
        if (originalGetWorkspaceFolder === undefined) {
            delete (vscode.workspace as any).getWorkspaceFolder;
        } else {
            (vscode.workspace as any).getWorkspaceFolder = originalGetWorkspaceFolder;
        }
    });

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

    test("JulesCodeLensProvider returns no lenses and skips symbol lookup when disabled", async () => {
        sandbox.stub(vscode.workspace, "getConfiguration").returns({
            get: () => false,
        } as any);
        const executeStub = sandbox.stub(vscode.commands, "executeCommand");

        const provider = new JulesCodeLensProvider({ appendLine: sandbox.stub() } as any);
        const lenses = await provider.provideCodeLenses(
            { uri: vscode.Uri.parse("file:///sample.ts") } as any,
            { isCancellationRequested: false } as any,
        );

        assert.deepStrictEqual(lenses, []);
        assert.strictEqual(executeStub.called, false);
        provider.dispose();
    });

    test("JulesCodeLensProvider returns lenses for nested symbols", async () => {
        const configStub = sandbox.stub(vscode.workspace, "getConfiguration").returns({
            get: () => true,
        } as any);
        const executeStub = sandbox.stub(vscode.commands, "executeCommand").resolves([
            {
                kind: vscode.SymbolKind.Function,
                range: new vscode.Range(1, 0, 3, 0),
                children: [],
            },
            {
                kind: vscode.SymbolKind.Class,
                range: new vscode.Range(5, 0, 10, 0),
                children: [
                    {
                        kind: vscode.SymbolKind.Method,
                        range: new vscode.Range(6, 2, 8, 0),
                        children: [],
                    },
                ],
            },
        ] as any);

        const provider = new JulesCodeLensProvider({ appendLine: () => {} } as any);
        const lenses = await provider.provideCodeLenses(
            { uri: vscode.Uri.parse("file:///sample.ts") } as any,
            { isCancellationRequested: false } as any,
        );

        assert.strictEqual(configStub.calledOnce, true);
        assert.strictEqual(executeStub.calledOnce, true);
        assert.strictEqual(lenses.length, 6);
        assert.strictEqual(lenses[0].command?.command, "jules-extension.inlineRefactor");
        provider.dispose();
    });

    test("JulesCodeLensProvider logs and returns empty array when symbol lookup fails", async () => {
        sandbox.stub(vscode.workspace, "getConfiguration").returns({
            get: () => true,
        } as any);
        sandbox.stub(vscode.commands, "executeCommand").rejects(new Error("boom"));
        const appendLine = sandbox.stub();

        const provider = new JulesCodeLensProvider({ appendLine } as any);
        const lenses = await provider.provideCodeLenses(
            { uri: vscode.Uri.parse("file:///sample.ts") } as any,
            { isCancellationRequested: false } as any,
        );

        assert.deepStrictEqual(lenses, []);
        assert.strictEqual(appendLine.calledOnce, true);
    });

    test("handleInlineTask shows an error when the file is outside the workspace", async () => {
        const showErrorStub = sandbox.stub(vscode.window, "showErrorMessage");
        sandbox.stub(vscode.workspace, "openTextDocument").resolves({
            getText: () => "const value = 1;",
            uri: vscode.Uri.parse("file:///outside.ts"),
            languageId: "typescript",
        } as any);
        (vscode.workspace as any).getWorkspaceFolder = sandbox.stub().returns(undefined);

        await handleInlineTask(
            {
                globalState: { get: sandbox.stub() },
                secrets: { get: sandbox.stub() },
            } as any,
            { appendLine: sandbox.stub() } as any,
            vscode.Uri.parse("file:///outside.ts"),
            new vscode.Range(0, 0, 0, 10),
            "Refactor",
        );

        assert.strictEqual(showErrorStub.calledOnce, true);
    });

    test("handleInlineTask stops when no specific source is selected", async () => {
        const showErrorStub = sandbox.stub(vscode.window, "showErrorMessage");
        sandbox.stub(vscode.workspace, "openTextDocument").resolves({
            getText: () => "const value = 1;",
            uri: vscode.Uri.parse("file:///workspace/file.ts"),
            languageId: "typescript",
        } as any);
        (vscode.workspace as any).getWorkspaceFolder = sandbox.stub().returns({ uri: vscode.Uri.parse("file:///workspace") });

        await handleInlineTask(
            {
                globalState: {
                    get: sandbox.stub().returns({ id: ALL_SOURCES_ID, name: "All Sources" }),
                },
                secrets: { get: sandbox.stub().resolves("api-key") },
            } as any,
            { appendLine: sandbox.stub() } as any,
            vscode.Uri.parse("file:///workspace/file.ts"),
            new vscode.Range(0, 0, 0, 10),
            "Refactor",
        );

        assert.strictEqual(showErrorStub.calledOnce, true);
    });

    test("handleInlineTask creates a session when all inputs are valid", async () => {
        sandbox.stub(vscode.workspace, "openTextDocument").resolves({
            getText: () => "const value = 1;",
            uri: { ...vscode.Uri.parse("file:///workspace/file.ts"), fsPath: "/workspace/file.ts" },
            languageId: "typescript",
        } as any);
        (vscode.workspace as any).getWorkspaceFolder = sandbox.stub().returns({ uri: vscode.Uri.parse("file:///workspace") });
        sandbox.stub(branchUtils, "getBranchesForSession").resolves({
            branches: ["main", "feature/test"],
            defaultBranch: "main",
            currentBranch: "feature/test",
            remoteBranches: ["main", "feature/test"],
        } as any);
        sandbox.stub(vscode.window, "showQuickPick").resolves({ label: "feature/test" } as any);
        const composerStub = sandbox.stub(composer, "showMessageComposer").resolves({
            prompt: "  add tests  ",
            createPR: true,
            requireApproval: true,
        });
        const createSessionStub = sandbox.stub(sessionUtils, "createJulesSession").resolves({} as any);

        const context = {
            globalState: {
                get: sandbox.stub().returns({
                    id: "source-1",
                    name: "repo",
                }),
            },
            secrets: {
                get: sandbox.stub().resolves("api-key"),
            },
        } as any;

        await handleInlineTask(
            context,
            { appendLine: sandbox.stub() } as any,
            vscode.Uri.parse("file:///workspace/file.ts"),
            new vscode.Range(0, 0, 0, 10),
            "Generate Tests",
        );

        assert.strictEqual(composerStub.calledOnce, true);
        assert.strictEqual(createSessionStub.calledOnce, true);
        assert.deepStrictEqual(createSessionStub.firstCall.args.slice(1), [
            { id: "source-1", name: "repo" },
            "api-key",
            "feature/test",
            "add tests",
            "Generate Tests in file.ts",
            "AUTO_CREATE_PR",
            true,
        ]);
    });

    test("registerInlineCommands registers providers and commands", () => {
        const codeLensDisposable = { dispose: sandbox.stub() };
        const codeActionDisposable = { dispose: sandbox.stub() };
        const commandDisposable = { dispose: sandbox.stub() };

        const codeLensStub = sandbox.stub(vscode.languages, "registerCodeLensProvider").returns(codeLensDisposable as any);
        const codeActionStub = sandbox.stub(vscode.languages, "registerCodeActionsProvider").returns(codeActionDisposable as any);
        const commandStub = sandbox.stub(vscode.commands, "registerCommand").returns(commandDisposable as any);

        const context = { subscriptions: [] as any[] } as any;
        registerInlineCommands(context, { appendLine: sandbox.stub() } as any);

        assert.strictEqual(codeLensStub.calledOnce, true);
        assert.strictEqual(codeActionStub.calledOnce, true);
        assert.strictEqual(commandStub.callCount, 2);
        assert.strictEqual(context.subscriptions.length, 5);
    });
});
