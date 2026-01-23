import * as vscode from 'vscode';

export class JulesPlanDocumentProvider implements vscode.TextDocumentContentProvider {
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;
    private readonly contents = new Map<string, string>();

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) || 'No plan content available.';
    }

    setContent(uri: vscode.Uri, content: string): void {
        this.contents.set(uri.toString(), content);
        this._onDidChange.fire(uri);
    }

    buildUri(sessionId: string): vscode.Uri {
        // Encode session ID safely in the path
        const normalized = sessionId.replace(/^sessions\//, "");
        // Encode the path component to handle special characters safely
        const encodedPath = encodeURIComponent(`Plan for ${normalized}.md`);
        return vscode.Uri.parse(`jules-plan://authority/${encodedPath}`);
    }
}
