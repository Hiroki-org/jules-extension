import * as vscode from "vscode";
import * as path from "path";
import { createJulesSession } from "./sessionUtils";
import { showMessageComposer } from "./composer";
import { getBranchesForSession } from "./branchUtils";
import { JulesApiClient } from "./julesApiClient";
import { sanitizeForLogging } from "./securityUtils";
import { SourceType } from "./types";
import { JULES_API_BASE_URL, ALL_SOURCES_ID } from "./julesApiConstants";
import { buildFencedCodeBlock } from "./markdownFencing";

/**
 * Provides CodeLens for Jules actions (Refactor, Generate Tests) above classes and functions.
 */
export class JulesCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
    private onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this.onDidChangeCodeLensesEmitter.event;
    private configListener: vscode.Disposable;

    constructor(private logChannel: vscode.OutputChannel) {
        this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("jules-extension.enableCodeLens")) {
                this.onDidChangeCodeLensesEmitter.fire();
            }
        });
    }

    public dispose() {
        this.configListener.dispose();
        this.onDidChangeCodeLensesEmitter.dispose();
    }

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const isEnabled = vscode.workspace.getConfiguration("jules-extension").get<boolean>("enableCodeLens", true);
        if (!isEnabled) {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];

        try {
            // Get document symbols to accurately find functions and classes and their full ranges
            const symbols = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
                "vscode.executeDocumentSymbolProvider",
                document.uri
            );

            if (token.isCancellationRequested) {
                return [];
            }

            if (!symbols) {
                return [];
            }

            const processSymbols = (syms: (vscode.DocumentSymbol | vscode.SymbolInformation)[]) => {
                for (const symbol of syms) {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    if (
                        symbol.kind === vscode.SymbolKind.Function ||
                        symbol.kind === vscode.SymbolKind.Class ||
                        symbol.kind === vscode.SymbolKind.Method
                    ) {
                        // Normalize the range whether it's a DocumentSymbol or SymbolInformation
                        const range = 'range' in symbol ? symbol.range : symbol.location.range;

                        // We place the CodeLens at the top of the symbol
                        const lensRange = new vscode.Range(range.start.line, 0, range.start.line, 0);

                        lenses.push(
                            new vscode.CodeLens(lensRange, {
                                title: "$(robot) Jules: Refactor",
                                tooltip: "Ask Jules to refactor this block",
                                command: "jules-extension.inlineRefactor",
                                arguments: [document.uri, range]
                            })
                        );
                        lenses.push(
                            new vscode.CodeLens(lensRange, {
                                title: "$(robot) Jules: Generate Tests",
                                tooltip: "Ask Jules to generate tests for this block",
                                command: "jules-extension.inlineGenerateTests",
                                arguments: [document.uri, range]
                            })
                        );
                    }

                    // Recursively process children if they exist (only DocumentSymbol has children)
                    if ('children' in symbol && symbol.children && symbol.children.length > 0) {
                        processSymbols(symbol.children);
                    }
                }
            };

            processSymbols(symbols);
        } catch (error) {
            const errSafe = sanitizeForLogging(error instanceof Error ? error.message : String(error));
            this.logChannel.appendLine(`[Jules] Failed to provide CodeLenses using symbols: ${errSafe}`);
        }

        return lenses;
    }
}

/**
 * Provides CodeActions (Quick Fixes) for Refactoring using Jules.
 */
export class JulesCodeActionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
        if (range.isEmpty) {
            return undefined;
        }

        const actions: vscode.CodeAction[] = [];

        const refactorAction = new vscode.CodeAction("Jules: Refactor Selection", vscode.CodeActionKind.Refactor);
        refactorAction.command = {
            title: "Jules: Refactor",
            command: "jules-extension.inlineRefactor",
            arguments: [document.uri, range]
        };
        actions.push(refactorAction);

        const testAction = new vscode.CodeAction("Jules: Generate Tests for Selection", vscode.CodeActionKind.Refactor.append("jules.generateTests"));
        testAction.command = {
            title: "Jules: Generate Tests",
            command: "jules-extension.inlineGenerateTests",
            arguments: [document.uri, range]
        };
        actions.push(testAction);

        return actions;
    }
}

export function buildInlineTaskPrompt(
    defaultTask: string,
    relativePath: string,
    languageId: string,
    codeSnippet: string
): string {
    const taskLower = defaultTask.toLowerCase();
    const preposition = defaultTask === "Generate Tests" ? " for" : "";
    return `Please ${taskLower}${preposition} the following code.\n\nFile: \`${relativePath}\`\n\n${buildFencedCodeBlock(codeSnippet, languageId)}\n`;
}

// Common handler for inline tasks (Refactor, Generate Tests, etc.)
export async function handleInlineTask(
    context: vscode.ExtensionContext,
    logChannel: vscode.OutputChannel,
    uri: vscode.Uri,
    range: vscode.Range | vscode.Selection,
    defaultTask: string
) {
    let document: vscode.TextDocument;
    try {
        document = await vscode.workspace.openTextDocument(uri);
    } catch (e) {
        const errorMsg = sanitizeForLogging(e instanceof Error ? e.message : String(e));
        logChannel.appendLine(`[Jules] Error opening document ${uri.toString()}: ${errorMsg}`);
        vscode.window.showErrorMessage("Could not open the target document.");
        return;
    }

    let codeSnippet = "";

    if (range && !range.isEmpty) {
        const selectionRange = range instanceof vscode.Selection ? range : new vscode.Range(range.start, range.end);
        codeSnippet = document.getText(selectionRange);
        if (!codeSnippet.trim()) {
            vscode.window.showErrorMessage("Selected range contains only whitespace.");
            return;
        }
    } else {
        // Fallback: Check if there's an active editor for this document that has a selection
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
        if (editor && !editor.selection.isEmpty) {
            const selectionText = document.getText(editor.selection);
            if (selectionText.trim().length > 0) {
                codeSnippet = selectionText;
            }
        }
    }

    if (!codeSnippet.trim()) {
        vscode.window.showErrorMessage("Please select a valid, non-empty code block to perform this action.");
        return;
    }

    const selectedSource = context.globalState.get("selected-source") as SourceType;
    if (!selectedSource || selectedSource.id === ALL_SOURCES_ID) {
        vscode.window.showErrorMessage("Please select a specific repository source first.");
        return;
    }

    const apiKey = await context.secrets.get("jules-api-key");
    if (!apiKey) {
        vscode.window.showErrorMessage('API Key not found. Please set it first using "Set Jules API Key" command.');
        return;
    }

    const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

    // ブランチ選択ロジック
    async function fetchBranches(options: { forceRefresh?: boolean; showProgress?: boolean }) {
        try {
            return await getBranchesForSession(selectedSource, apiClient, logChannel, context, options);
        } catch (error) {
            const errSafe = sanitizeForLogging(error instanceof Error ? error.message : String(error));
            logChannel.appendLine(`[Jules] Error fetching branches: ${errSafe}`);
            vscode.window.showErrorMessage(`Failed to fetch branches: ${errSafe}`);
            throw error;
        }
    }

    let branchInfo;
    try {
        branchInfo = await fetchBranches({ showProgress: true });
    } catch {
        return;
    }

    const {
        branches,
        defaultBranch: selectedDefaultBranch,
        currentBranch,
        remoteBranches,
    } = branchInfo;

    const remoteBranchSet = new Set(remoteBranches);
    const selectedBranch = await vscode.window.showQuickPick(
        branches
            .filter((branch) => remoteBranchSet.has(branch))
            .map((branch) => ({
                label: branch,
                picked: branch === selectedDefaultBranch,
                description: branch === selectedDefaultBranch && branch === currentBranch
                    ? "(default, current)"
                    : branch === selectedDefaultBranch
                        ? "(default)"
                        : branch === currentBranch
                            ? "(current)"
                            : undefined,
            })),
        {
            placeHolder: "Select a remote branch for this session",
            title: "Branch Selection",
        },
    );

    if (!selectedBranch || !selectedBranch.label) {
        vscode.window.showWarningMessage("Branch selection was cancelled or invalid.");
        return;
    }

    const startingBranch = selectedBranch.label;

    const result = await showMessageComposer({
        title: `Jules: ${defaultTask}`,
        placeholder: `Describe your task or modify the prompt below...`,
        showCreatePrCheckbox: true,
        showRequireApprovalCheckbox: true,
        value: buildInlineTaskPrompt(
            defaultTask,
            vscode.workspace.asRelativePath(document.uri),
            document.languageId,
            codeSnippet
        )
    });

    if (result === undefined) {
        return;
    }

    const userPrompt = result.prompt.trim();
    if (!userPrompt) {
        vscode.window.showWarningMessage("Task description was empty. Session not created.");
        return;
    }

    const title = `${defaultTask} in ${path.basename(document.uri.fsPath)}`;
    const automationMode = result.createPR ? "AUTO_CREATE_PR" : "MANUAL";

    try {
        await createJulesSession(
            context,
            selectedSource,
            apiKey,
            startingBranch,
            userPrompt,
            title,
            automationMode,
            result.requireApproval
        );
    } catch (error) {
        const errSafe = sanitizeForLogging(error instanceof Error ? error.message : String(error));
        const stackSafe = error instanceof Error ? sanitizeForLogging(error.stack || "") : "";
        logChannel.appendLine(`[Jules] Failed to create inline session: ${errSafe}\n${stackSafe}`);
        vscode.window.showErrorMessage(`Failed to create Jules session. Please check the logs for details.`);
    }
}

export function registerInlineCommands(context: vscode.ExtensionContext, logChannel: vscode.OutputChannel) {
    const documentSelector: vscode.DocumentSelector = [
        { scheme: "file", language: "typescript" },
        { scheme: "file", language: "javascript" },
        { scheme: "file", language: "typescriptreact" },
        { scheme: "file", language: "javascriptreact" },
        { scheme: "file", language: "python" },
        { scheme: "file", language: "java" },
        { scheme: "file", language: "go" },
        { scheme: "file", language: "csharp" },
        { scheme: "file", language: "cpp" },
        { scheme: "file", language: "c" },
    ];

    const julesCodeLensProvider = new JulesCodeLensProvider(logChannel);
    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
        documentSelector,
        julesCodeLensProvider
    );
    context.subscriptions.push(codeLensProviderDisposable, julesCodeLensProvider);

    const julesCodeActionProvider = new JulesCodeActionProvider();
    const codeActionProviderDisposable = vscode.languages.registerCodeActionsProvider(
        documentSelector,
        julesCodeActionProvider,
        { providedCodeActionKinds: [vscode.CodeActionKind.Refactor] }
    );
    context.subscriptions.push(codeActionProviderDisposable);

    const inlineRefactorDisposable = vscode.commands.registerCommand(
        "jules-extension.inlineRefactor",
        async (uri?: vscode.Uri, range?: vscode.Range | vscode.Selection) => {
            const activeEditor = vscode.window.activeTextEditor;
            const targetUri = uri || activeEditor?.document.uri;
            const targetRange = range || activeEditor?.selection;
            if (targetUri && targetRange) {
                await handleInlineTask(context, logChannel, targetUri, targetRange, "Refactor");
            } else {
                vscode.window.showErrorMessage("No code selected to refactor.");
            }
        }
    );

    const inlineGenerateTestsDisposable = vscode.commands.registerCommand(
        "jules-extension.inlineGenerateTests",
        async (uri?: vscode.Uri, range?: vscode.Range | vscode.Selection) => {
            const activeEditor = vscode.window.activeTextEditor;
            const targetUri = uri || activeEditor?.document.uri;
            const targetRange = range || activeEditor?.selection;
            if (targetUri && targetRange) {
                await handleInlineTask(context, logChannel, targetUri, targetRange, "Generate Tests");
            } else {
                vscode.window.showErrorMessage("No code selected to generate tests for.");
            }
        }
    );

    context.subscriptions.push(inlineRefactorDisposable, inlineGenerateTestsDisposable);
}
