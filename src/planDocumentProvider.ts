import * as vscode from "vscode";

export class JulesPlanDocumentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private planContents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.planContents.get(uri.toString()) || "(No plan content available)";
  }

  updatePlan(uri: vscode.Uri, content: string): void {
    this.planContents.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }
}
