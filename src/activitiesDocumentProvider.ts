import * as vscode from "vscode";
export class JulesActivitiesDocumentProvider
  implements vscode.TextDocumentContentProvider
{
  private readonly contents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  setContent(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
  }

  buildUri(sessionId: string): vscode.Uri {
    const normalized = sessionId.replace(/^sessions\//, "");
    return vscode.Uri.parse(
      `jules-activities://sessions/${normalized}/activities.log`,
    );
  }
}
