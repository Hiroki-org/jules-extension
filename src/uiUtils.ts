import * as vscode from 'vscode';
import { Source as SourceType } from './types';

export function updateStatusBar(
    context: vscode.ExtensionContext,
    statusBarItem: vscode.StatusBarItem
) {
    const selectedSource = context.globalState.get<SourceType>("selected-source");

    if (selectedSource) {
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
