import * as vscode from "vscode";

/**
 * ユーザーのプロンプトに設定された拡張のカスタムプロンプトを結合して最終プロンプトを生成する。
 *
 * @param userPrompt - ベースとなるユーザーのプロンプト
 * @returns カスタムプロンプトが設定されていれば2つの改行で区切って結合した文字列、設定されていなければ元の `userPrompt`
 */
export function buildFinalPrompt(userPrompt: string): string {
  const customPrompt = vscode.workspace
    .getConfiguration("jules-extension")
    .get<string>("customPrompt", "");
  return customPrompt ? `${userPrompt}\n\n${customPrompt}` : userPrompt;
}
