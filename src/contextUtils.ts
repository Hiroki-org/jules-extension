import * as vscode from "vscode";

/**
 * 現在アクティブなエディタからファイルパスと選択行範囲を取得する
 * 形式: /{relativePath} line {startLine}~{endLine}
 */
export function getActiveEditorContext(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document || editor.document.uri.scheme !== "file") {
        return null;
    }

    const normalizedFsPath = editor.document.uri.fsPath.replace(/\\/g, '/');
    const relativePath = vscode.workspace.asRelativePath(editor.document.uri).replace(/\\/g, '/');
    if (!relativePath || relativePath === normalizedFsPath) {
        // ワークスペース外のファイルや相対パスが取得できない場合
        return null;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        // 選択範囲がない場合（カーソル位置のみ）
        const cursorLine = selection.start.line + 1;
        return `/${relativePath} line ${cursorLine}`;
    } else {
        // 選択範囲がある場合
        const startLine = selection.start.line + 1;
        const endLine = selection.end.character === 0 ? selection.end.line : selection.end.line + 1;
        if (startLine === endLine) {
            return `/${relativePath} line ${startLine}`;
        }
        return `/${relativePath} line ${startLine}~${endLine}`;
    }
}

/**
 * フォルダ選択ダイアログを表示し、プロジェクトルート相対パスを返す
 */
export async function selectFolderContext(): Promise<string | null> {
    const options: vscode.OpenDialogOptions = {
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Folder as Context",
    };

    const folderUri = await vscode.window.showOpenDialog(options);
    if (folderUri && folderUri[0]) {
        const normalizedFsPath = folderUri[0].fsPath.replace(/\\/g, '/');
        const relativePath = vscode.workspace.asRelativePath(folderUri[0]).replace(/\\/g, '/');
        if (!relativePath || relativePath === normalizedFsPath) {
            return null;
        }
        // フォルダの場合は末尾に / を付与
        return `/${relativePath}${relativePath.endsWith("/") ? "" : "/"}`;
    }
    return null;
}
