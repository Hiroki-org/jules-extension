import * as vscode from 'vscode';
import { Source as SourceType, Session } from './types';
import { SessionTreeItem } from './sessionViewProvider';

export interface SourceQuickPickItem extends vscode.QuickPickItem {
  source: SourceType;
}

export function updateStatusBar(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem
) {
  const selectedSource = context.globalState.get<SourceType>("selected-source");

  if (selectedSource) {
    // GitHubリポジトリ名を抽出（例: "sources/github/owner/repo" -> "owner/repo"）
    const repoMatch = selectedSource.name?.match(/sources\/github\/(.+)/);
    const repoName = repoMatch ? repoMatch[1] : selectedSource.name;

    statusBarItem.text = `$(repo) Jules: ${repoName}`;
    statusBarItem.tooltip = `Current Source: ${repoName}\nClick to change source`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(repo) Jules: No source selected`;
    statusBarItem.tooltip = "Click to select a source";
    statusBarItem.show();
  }
}

export async function handleOpenInWebApp(item: SessionTreeItem | undefined, logChannel: vscode.OutputChannel) {
  if (!item || !(item instanceof SessionTreeItem)) {
    vscode.window.showErrorMessage("No session selected.");
    return;
  }
  const session = item.session;
  if (session.url) {
    const success = await vscode.env.openExternal(vscode.Uri.parse(session.url));
    if (!success) {
      logChannel.appendLine(`[Jules] Failed to open external URL: ${session.url}`);
      vscode.window.showWarningMessage('Failed to open the URL in the browser.');
    }
  } else {
    vscode.window.showWarningMessage(
      "No URL is available for this session."
    );
  }
}
