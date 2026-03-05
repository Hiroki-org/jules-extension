import * as assert from "assert";
import {
  formatContextForPrompt,
  buildContextPrefix,
  SessionContext,
  FileContext,
} from "../contextUtils";

suite("contextUtils Test Suite", () => {
  suite("formatContextForPrompt", () => {
    test("ファイルコンテキストのみ（単一行選択）をフォーマットする", () => {
      const context: SessionContext = {
        fileContext: {
          filePath: "/workspace/src/app.ts",
          startLine: 10,
          endLine: 10,
        },
        folders: [],
      };
      const result = formatContextForPrompt(context);
      assert.strictEqual(result, "File: /workspace/src/app.ts (line 10)");
    });

    test("ファイルコンテキストのみ（複数行選択）をフォーマットする", () => {
      const context: SessionContext = {
        fileContext: {
          filePath: "/workspace/src/app.ts",
          startLine: 5,
          endLine: 20,
        },
        folders: [],
      };
      const result = formatContextForPrompt(context);
      assert.strictEqual(result, "File: /workspace/src/app.ts (lines 5-20)");
    });

    test("フォルダコンテキストのみをフォーマットする", () => {
      const context: SessionContext = {
        folders: ["/workspace/src"],
      };
      const result = formatContextForPrompt(context);
      assert.strictEqual(result, "Folder: /workspace/src");
    });

    test("複数フォルダをフォーマットする", () => {
      const context: SessionContext = {
        folders: ["/workspace/src", "/workspace/tests"],
      };
      const result = formatContextForPrompt(context);
      assert.strictEqual(
        result,
        "Folder: /workspace/src\nFolder: /workspace/tests"
      );
    });

    test("ファイルとフォルダの両方をフォーマットする", () => {
      const context: SessionContext = {
        fileContext: {
          filePath: "/workspace/src/app.ts",
          startLine: 1,
          endLine: 3,
        },
        folders: ["/workspace/lib"],
      };
      const result = formatContextForPrompt(context);
      assert.strictEqual(
        result,
        "File: /workspace/src/app.ts (lines 1-3)\nFolder: /workspace/lib"
      );
    });

    test("コンテキストが空の場合は空文字を返す", () => {
      const context: SessionContext = { folders: [] };
      const result = formatContextForPrompt(context);
      assert.strictEqual(result, "");
    });

    test("fileContext が undefined の場合はフォルダのみを出力する", () => {
      const context: SessionContext = {
        fileContext: undefined,
        folders: ["/workspace"],
      };
      const result = formatContextForPrompt(context);
      assert.strictEqual(result, "Folder: /workspace");
    });
  });

  suite("buildContextPrefix", () => {
    test("コンテキストがある場合は Context: ヘッダー付きのプレフィックスを返す", () => {
      const context: SessionContext = {
        fileContext: {
          filePath: "/workspace/src/app.ts",
          startLine: 42,
          endLine: 42,
        },
        folders: [],
      };
      const result = buildContextPrefix(context);
      assert.strictEqual(
        result,
        "Context:\nFile: /workspace/src/app.ts (line 42)\n\n"
      );
    });

    test("コンテキストが空の場合は空文字を返す", () => {
      const context: SessionContext = { folders: [] };
      const result = buildContextPrefix(context);
      assert.strictEqual(result, "");
    });

    test("フォルダのみの場合は正しいプレフィックスを返す", () => {
      const context: SessionContext = {
        folders: ["/workspace/src"],
      };
      const result = buildContextPrefix(context);
      assert.strictEqual(result, "Context:\nFolder: /workspace/src\n\n");
    });

    test("プレフィックスをプロンプトに結合すると正しい文字列になる", () => {
      const context: SessionContext = {
        fileContext: {
          filePath: "/workspace/src/utils.ts",
          startLine: 1,
          endLine: 5,
        },
        folders: [],
      };
      const prefix = buildContextPrefix(context);
      const userPrompt = "Fix the bug in this file";
      const combined = prefix + userPrompt;
      assert.strictEqual(
        combined,
        "Context:\nFile: /workspace/src/utils.ts (lines 1-5)\n\nFix the bug in this file"
      );
    });
  });
});
