import * as assert from "assert";
import * as vscode from "vscode";
import { getActiveEditorContext } from "../contextUtils";

suite("contextUtils unit tests", () => {
    let originalActiveEditor: any;
    let originalAsRelativePath: any;

    setup(() => {
        originalActiveEditor = (vscode.window as any).activeTextEditor;
        originalAsRelativePath = vscode.workspace.asRelativePath;
    });

    teardown(() => {
        (vscode.window as any).activeTextEditor = originalActiveEditor;
        (vscode.workspace as any).asRelativePath = originalAsRelativePath;
    });

    test("should return null when no active editor", () => {
        (vscode.window as any).activeTextEditor = undefined;
        const context = getActiveEditorContext();
        assert.strictEqual(context, null);
    });

    test("should return relative path for single line selection", () => {
        (vscode.window as any).activeTextEditor = {
            document: {
                uri: {
                    scheme: "file",
                    fsPath: "/workspace/src/file.ts"
                }
            },
            selection: {
                isEmpty: true,
                start: { line: 19 }, // 20th line
                end: { line: 19, character: 0 }
            }
        };

        // Mock workspace.asRelativePath
        (vscode.workspace as any).asRelativePath = (uri: any) => "src/file.ts";

        const context = getActiveEditorContext();
        assert.strictEqual(context, "/src/file.ts line 20");
    });

    test("should return relative path for multi-line selection", () => {
        (vscode.window as any).activeTextEditor = {
            document: {
                uri: {
                    scheme: "file",
                    fsPath: "/workspace/src/file.ts"
                }
            },
            selection: {
                isEmpty: false,
                start: { line: 19 },
                end: { line: 24, character: 1 }
            }
        };

        (vscode.workspace as any).asRelativePath = (uri: any) => "src/file.ts";

        const context = getActiveEditorContext();
        assert.strictEqual(context, "/src/file.ts line 20~25");
    });
});
