import * as vscode from "vscode";

export interface FileContext {
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface SessionContext {
  fileContext?: FileContext;
  folders: string[];
}

/**
 * 現在アクティブなエディタのファイルパスと選択行範囲を取得する。
 * エディタが開かれていない場合は undefined を返す。
 */
export function getActiveFileContext(): FileContext | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const filePath = editor.document.uri.fsPath;
  const selection = editor.selection;
  // 1-indexed の行番号に変換
  const startLine = selection.start.line + 1;
  const endLine = selection.end.line + 1;

  return { filePath, startLine, endLine };
}

/**
 * ワークスペースフォルダのパス一覧を取得する。
 */
export function getWorkspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((f: vscode.WorkspaceFolder) => f.uri.fsPath);
}

/**
 * コンテキスト情報をプロンプト用の文字列にフォーマットする。
 */
export function formatContextForPrompt(context: SessionContext): string {
  const parts: string[] = [];

  if (context.fileContext) {
    const { filePath, startLine, endLine } = context.fileContext;
    if (startLine === endLine) {
      parts.push(`File: ${filePath} (line ${startLine})`);
    } else {
      parts.push(`File: ${filePath} (lines ${startLine}-${endLine})`);
    }
  }

  for (const folder of context.folders) {
    parts.push(`Folder: ${folder}`);
  }

  return parts.join("\n");
}

/**
 * コンテキスト情報をプロンプト先頭に付加するプレフィックス文字列を生成する。
 * コンテキストが空の場合は空文字列を返す。
 */
export function buildContextPrefix(context: SessionContext): string {
  const formatted = formatContextForPrompt(context);
  if (!formatted) {
    return "";
  }
  return `Context:\n${formatted}\n\n`;
}
