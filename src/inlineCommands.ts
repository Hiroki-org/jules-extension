import * as vscode from "vscode";

/**
 * Provides CodeLens for Jules actions (Refactor, Generate Tests) above classes and functions.
 */
export class JulesCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this.onDidChangeCodeLensesEmitter.event;

    constructor() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("jules-extension.enableCodeLens")) {
                this.onDidChangeCodeLensesEmitter.fire();
            }
        });
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
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                "vscode.executeDocumentSymbolProvider",
                document.uri
            );

            if (!symbols) {
                return [];
            }

            const processSymbols = (syms: vscode.DocumentSymbol[]) => {
                for (const symbol of syms) {
                    if (
                        symbol.kind === vscode.SymbolKind.Function ||
                        symbol.kind === vscode.SymbolKind.Class ||
                        symbol.kind === vscode.SymbolKind.Method
                    ) {
                        // The range here represents the whole block of code for the symbol
                        const range = symbol.range;

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

                    // Recursively process children
                    if (symbol.children && symbol.children.length > 0) {
                        processSymbols(symbol.children);
                    }
                }
            };

            processSymbols(symbols);
        } catch (error) {
            console.error("Failed to provide CodeLenses using symbols fallback to empty", error);
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
        // Return if nothing is selected or range is empty, and it's not a diagnostic request.
        // Actually, we can show it anytime there is a selection.
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

        const testAction = new vscode.CodeAction("Jules: Generate Tests for Selection", vscode.CodeActionKind.Refactor);
        testAction.command = {
            title: "Jules: Generate Tests",
            command: "jules-extension.inlineGenerateTests",
            arguments: [document.uri, range]
        };
        actions.push(testAction);

        return actions;
    }
}
