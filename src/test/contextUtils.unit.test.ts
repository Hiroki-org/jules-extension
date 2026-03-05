import * as assert from "assert";
import * as vscode from "vscode";
import { getActiveEditorContext } from "../contextUtils";

describe("contextUtils unit tests", () => {
    it("should return null when no active editor", () => {
        (vscode.window as any).activeTextEditor = undefined;
        const context = getActiveEditorContext();
        assert.strictEqual(context, null);
    });

    it("should return relative path for single line selection", () => {
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
                end: { line: 19 }
            }
        };

        // Mock workspace.asRelativePath
        (vscode.workspace as any).asRelativePath = (uri: any) => "src/file.ts";

        const context = getActiveEditorContext();
        assert.strictEqual(context, "/src/file.ts line 20");
    });

    it("should return relative path for multi-line selection", () => {
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
                end: { line: 24 }
            }
        };

        (vscode.workspace as any).asRelativePath = (uri: any) => "src/file.ts";

        const context = getActiveEditorContext();
        assert.strictEqual(context, "/src/file.ts line 20~25");
    });
});
