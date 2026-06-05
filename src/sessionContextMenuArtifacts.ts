import * as vscode from "vscode";
import * as path from "path";
import { fetchLatestSessionArtifacts, getCachedSessionArtifacts, ChangeSetSummary } from "./sessionArtifacts";
import { sanitizeError } from "./errorUtils";
import { isValidSessionId } from "./securityUtils";

export class JulesDiffDocumentProvider implements vscode.TextDocumentContentProvider {
    private readonly contents = new Map<string, string>();

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) ?? "";
    }

    setContent(uri: vscode.Uri, content: string): void {
        this.contents.set(uri.toString(), content);
    }

    buildUri(sessionId: string, kind: "before" | "after"): vscode.Uri {
        const normalized = sessionId.replace(/^sessions\//, "");
        return vscode.Uri.parse(`jules-diff://sessions/${normalized}/${kind}.patch`);
    }
}

// Intentionally keep a small wrapper around the async implementation to
// provide a stable exported API and allow future logic (e.g., logging or
// alternative resolution strategies) without changing callers.
export function resolveWorkspaceFile(targetPath: string): Promise<vscode.Uri | null> {
    return resolveWorkspaceFileAsync(targetPath);
}

async function resolveWorkspaceFileAsync(targetPath: string): Promise<vscode.Uri | null> {
    // 1. Reject absolute paths immediately for security
    if (path.isAbsolute(targetPath)) {
        console.warn(`[Security] Rejected absolute path in changeset: ${targetPath}`);
        return null;
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
        return null;
    }

    // 2. Parallelize file existence checks while preserving folder priority order
    const checks = folders.map(async (folder) => {
        const folderPath = folder.uri.fsPath;
        // Use path.resolve to handle relative paths and normalization
        const candidatePath = path.resolve(folderPath, targetPath);

        // Security Check: Ensure resolved path is still inside the workspace folder
        const relative = path.relative(folderPath, candidatePath);
        const isSafe = !relative.startsWith('..') && !path.isAbsolute(relative);

        if (!isSafe) {
            console.warn(`[Security] Rejected path traversal attempt: ${targetPath} -> ${candidatePath}`);
            throw new Error('Unsafe path');
        }

        const candidateUri = vscode.Uri.file(candidatePath);
        // Use async fs.stat instead of synchronous fs.existsSync
        await vscode.workspace.fs.stat(candidateUri);

        return { uri: candidateUri };
    });

        const results = await Promise.allSettled(checks);

        // Promise.allSettled guarantees the results array matches the order of the input iterable.
        // Thus, iterating from 0 to length - 1 ensures we find the highest priority (first) folder's file.
        for (let i = 0; i < results.length; i += 1) {
            const result = results[i];
            if (result.status === 'fulfilled') {
                return result.value.uri;
            }
        }

        return null;
}

function buildChangeSetItems(changeSet: ChangeSetSummary): Array<vscode.QuickPickItem & { filePath: string }> {
    const files = changeSet.files ?? [];
    return files.map((file) => {
        const description = file.status;
        return {
            label: file.path,
            description,
            filePath: file.path,
        };
    });
}

export async function openLatestDiffForSession(options: {
    sessionId: string;
    sessionTitle?: string;
    apiKey: string;
    apiBaseUrl: string;
    logChannel: vscode.OutputChannel;
    diffProvider: JulesDiffDocumentProvider;
}): Promise<void> {
    const { sessionId, sessionTitle, apiKey, apiBaseUrl, logChannel, diffProvider } = options;

    if (!isValidSessionId(sessionId)) {
        vscode.window.showErrorMessage("Invalid session ID.");
        return;
    }

    try {
        const artifacts = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Loading latest diff...",
            },
            async () => {
                const cached = getCachedSessionArtifacts(sessionId);
                if (cached?.latestDiff) {
                    return cached;
                }
                return fetchLatestSessionArtifacts(apiKey, sessionId, apiBaseUrl);
            }
        );

        if (!artifacts.latestDiff) {
            vscode.window.showErrorMessage("No diff available for this session.");
            return;
        }

        const leftUri = diffProvider.buildUri(sessionId, "before");
        const rightUri = diffProvider.buildUri(sessionId, "after");
        diffProvider.setContent(leftUri, "");
        diffProvider.setContent(rightUri, artifacts.latestDiff);

        const title = sessionTitle ? `Latest Diff: ${sessionTitle}` : "Latest Diff";
        await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title);
    } catch (error) {
        logChannel.appendLine(`Jules: Failed to open latest diff: ${sanitizeError(error)}`);
        vscode.window.showErrorMessage("Failed to open latest diff.");
    }
}

export async function openChangesetForSession(options: {
    sessionId: string;
    sessionTitle?: string;
    apiKey: string;
    apiBaseUrl: string;
    logChannel: vscode.OutputChannel;
}): Promise<void> {
    const { sessionId, sessionTitle, apiKey, apiBaseUrl, logChannel } = options;

    if (!isValidSessionId(sessionId)) {
        vscode.window.showErrorMessage("Invalid session ID.");
        return;
    }

    try {
        const artifacts = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Loading changeset...",
            },
            async () => {
                const cached = getCachedSessionArtifacts(sessionId);
                if (cached?.latestChangeSet) {
                    return cached;
                }
                return fetchLatestSessionArtifacts(apiKey, sessionId, apiBaseUrl);
            }
        );

        if (!artifacts.latestChangeSet) {
            vscode.window.showErrorMessage("No changeset available for this session.");
            return;
        }

        const quickPickItems = buildChangeSetItems(artifacts.latestChangeSet);
        if (quickPickItems.length === 0) {
            vscode.window.showErrorMessage("No files found in changeset.");
            return;
        }

        const selection = await vscode.window.showQuickPick(quickPickItems, {
            title: sessionTitle ? `Changeset: ${sessionTitle}` : "Changeset",
            placeHolder: "Select a file to open",
            matchOnDescription: true,
        });

        if (!selection) {
            return;
        }

        const uri = await resolveWorkspaceFile(selection.filePath);
        if (!uri) {
            vscode.window.showErrorMessage("File not found in workspace (or invalid path).");
            return;
        }

        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: true });
    } catch (error) {
        logChannel.appendLine(`Jules: Failed to open changeset: ${sanitizeError(error)}`);
        vscode.window.showErrorMessage("Failed to open changeset.");
    }
}
