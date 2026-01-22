import * as vscode from 'vscode';

export class JulesPlanProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  // Map to store plan content keyed by sessionId
  private plans = new Map<string, string>();

  updatePlan(sessionId: string, content: string): void {
    this.plans.set(sessionId, content);
    // Notify all listeners that any URI associated with this session might have changed.
    // However, since we use sessionId in the query or path, we might need to be specific.
    // For simplicity, we assume the URI follows a specific pattern.
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    // Expected URI format: jules-plan:Plan - SessionTitle.md?sessionId=...
    const query = new URLSearchParams(uri.query);
    const sessionId = query.get('sessionId');

    if (!sessionId) {
      return '(Error: Invalid plan URI, missing sessionId)';
    }

    const content = this.plans.get(sessionId);
    if (!content) {
      return '(Plan content not found or expired)';
    }

    return content;
  }
}
