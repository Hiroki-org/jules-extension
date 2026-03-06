import * as vscode from "vscode";
import * as path from "path";
import { createJulesSession } from "./sessionUtils";
import { showMessageComposer } from "./composer";
import { getBranchesForSession } from "./branchUtils";
import { JulesApiClient } from "./julesApiClient";
import { SourceType } from "./types";

const ALL_SOURCES_ID = "all_repos";
const JULES_API_BASE_URL = "https://jules.googleapis.com/v1alpha";

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

// Common handler for inline tasks (Refactor, Generate Tests, etc.)
async function handleInlineTask(
    context: vscode.ExtensionContext,
    logChannel: vscode.OutputChannel,
    uri: vscode.Uri,
    range: vscode.Range | vscode.Selection,
    defaultTask: string
) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active text editor found.");
      return;
    }

    const document = editor.document;
    const selectionRange = range instanceof vscode.Selection ? range : new vscode.Range(range.start, range.end);
    let codeSnippet = document.getText(selectionRange);

    // If no selection or range is empty and we triggered via context menu, maybe use the whole file or warn
    if (!codeSnippet.trim()) {
      if (editor.selection && !editor.selection.isEmpty) {
        codeSnippet = document.getText(editor.selection);
      } else {
        vscode.window.showErrorMessage("Please select some code to perform this action.");
        return;
      }
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
    const {
      branches,
      defaultBranch: selectedDefaultBranch,
      currentBranch,
      remoteBranches,
    } = await getBranchesForSession(
      selectedSource,
      apiClient,
      logChannel,
      context,
      { showProgress: true },
    );

    const selectedBranch = await vscode.window.showQuickPick(
      branches.map((branch) => ({
        label: branch,
        picked: branch === selectedDefaultBranch,
        description:
          (branch === selectedDefaultBranch ? "(default)" : undefined) ||
          (branch === currentBranch ? "(current)" : undefined),
      })),
      {
        placeHolder: "Select a branch for this session",
        title: "Branch Selection",
      },
    );

    if (!selectedBranch) {
      vscode.window.showWarningMessage("Branch selection was cancelled.");
      return;
    }

    let startingBranch = selectedBranch.label;

    if (!new Set(remoteBranches).has(startingBranch)) {
      logChannel.appendLine(`[Jules] Branch "${startingBranch}" not found in cached remote branches, re-fetching...`);
      const freshBranchInfo = await getBranchesForSession(
        selectedSource,
        apiClient,
        logChannel,
        context,
        { forceRefresh: true, showProgress: true },
      );
      if (!new Set(freshBranchInfo.remoteBranches).has(startingBranch)) {
        vscode.window.showErrorMessage(`Branch "${startingBranch}" must exist on remote to create a session.`);
        return;
      }
    }

    const result = await showMessageComposer({
      title: `Jules: ${defaultTask}`,
      placeholder: `Provide additional instructions for Jules...`,
      showCreatePrCheckbox: true,
      showRequireApprovalCheckbox: true,
      value: `Please ${defaultTask.toLowerCase()} the following code.\n\nFile: \`${vscode.workspace.asRelativePath(document.uri)}\`\n\n\`\`\`${document.languageId}\n${codeSnippet}\n\`\`\`\n`
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
      vscode.window.showErrorMessage(`Failed to create session: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}

export function registerInlineCommands(context: vscode.ExtensionContext, logChannel: vscode.OutputChannel) {
  const julesCodeLensProvider = new JulesCodeLensProvider();
  const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
    "*",
    julesCodeLensProvider
  );
  context.subscriptions.push(codeLensProviderDisposable);

  const julesCodeActionProvider = new JulesCodeActionProvider();
  const codeActionProviderDisposable = vscode.languages.registerCodeActionsProvider(
    "*",
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
