import Module from "module";

function createCodeActionKind(value: string) {
    return {
        value,
        append: (suffix: string) => createCodeActionKind(`${value}.${suffix}`),
    };
}

const mockVscode = {
    workspace: {
        fs: {
            stat: async () => {
                throw mockVscode.FileSystemError.FileNotFound();
            },
            readDirectory: async () => [],
            readFile: async () => Buffer.from(""),
            writeFile: async () => { },
            delete: async () => { },
            rename: async () => { },
            copy: async () => { },
            createDirectory: async () => { },
            isWritableFileSystem: async () => true,
        },
        workspaceFolders: undefined as any,
        getConfiguration: () => ({
            get: (key: string, defaultValue: any) => defaultValue,
        }),
        openTextDocument: async () => ({
            getText: (range?: any) => "mock text",
            uri: { toString: () => "file:///mock" },
            languageId: "typescript"
        }) as any,
        asRelativePath: (uri: any) => uri.fsPath || String(uri),
        onDidChangeConfiguration: () => ({ dispose: () => { } }),
        registerTextDocumentContentProvider: () => ({ dispose: () => { } }),
    },
    commands: {
        registerCommand: () => ({ dispose: () => { } }),
        executeCommand: async () => undefined,
    },
    window: {
        showInformationMessage: () => undefined,
        showWarningMessage: () => undefined,
        showErrorMessage: () => undefined,
        showQuickPick: async () => undefined,
        withProgress: async (_opts: any, task: any) => task({ report: () => { } }, { isCancellationRequested: false }),
        showTextDocument: async () => undefined,
        activeTextEditor: undefined,
        visibleTextEditors: [],
        createTreeView: () => ({ dispose: () => { } }),
        createStatusBarItem: () => ({ show: () => { }, hide: () => { }, dispose: () => { } }),
        createOutputChannel: () => ({ append: () => { }, appendLine: () => { }, replace: () => { }, clear: () => { }, show: () => { }, hide: () => { }, dispose: () => { } }),
        registerWebviewViewProvider: () => ({ dispose: () => { } }),
    },
    env: {
        openExternal: async () => true,
    },
    extensions: {
        getExtension: () => undefined,
        all: [],
    },
    Uri: {
        file: (fsPath: string) => ({
            fsPath,
            scheme: "file",
            toString: () => `file://${fsPath}`,
        }),
        parse: (value: string) => ({
            fsPath: value.replace(/^file:\/\//, ""),
            toString: () => value,
        }),
    },
    FileType: {
        File: 1,
        Directory: 2,
        SymbolicLink: 64,
    },
    FileSystemError: {
        FileNotFound: () => Object.assign(new Error("FileNotFound"), { code: "FileNotFound" }),
    },
    SymbolKind: {
        File: 0,
        Module: 1,
        Namespace: 2,
        Package: 3,
        Class: 4,
        Method: 5,
        Property: 6,
        Field: 7,
        Constructor: 8,
        Enum: 9,
        Interface: 10,
        Function: 11,
        Variable: 12,
        Constant: 13,
        String: 14,
        Number: 15,
        Boolean: 16,
        Array: 17,
        Object: 18,
        Key: 19,
        Null: 20,
        EnumMember: 21,
        Struct: 22,
        Event: 23,
        Operator: 24,
        TypeParameter: 25,
    },
    CodeActionKind: {
        Refactor: createCodeActionKind('refactor')
    },
    CodeAction: class CodeAction {
        command: any;
        constructor(public title: string, public kind: any) { }
    },
    Position: class Position {
        constructor(public line: number, public character: number) { }
    },
    Range: class Range {
        start: any;
        end: any;
        constructor(startLine: number, startChar: number, endLine: number, endChar: number);
        constructor(start: any, end: any);
        constructor(p1: any, p2: any, p3?: any, p4?: any) {
            if (typeof p3 === 'number') {
                this.start = { line: p1, character: p2 };
                this.end = { line: p3, character: p4 };
            } else {
                this.start = p1;
                this.end = p2;
            }
        }
        get isEmpty() { return this.start.line === this.end.line && this.start.character === this.end.character; }
    },
    Selection: class Selection {
        start: any;
        end: any;
        constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
            this.start = { line: startLine, character: startChar };
            this.end = { line: endLine, character: endChar };
        }
        get isEmpty() { return this.start.line === this.end.line && this.start.character === this.end.character; }
    },
    CancellationTokenSource: class CancellationTokenSource {
        token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { } }) };
        cancel() { this.token.isCancellationRequested = true; }
        dispose() { }
    },
    MarkdownString: class MarkdownString {
        value: string;
        isTrusted?: boolean;
        constructor(value: string = "", isTrusted: boolean = false) {
            this.value = value;
            this.isTrusted = isTrusted;
        }
        appendMarkdown(value: string) {
            this.value += value;
            return this;
        }
        appendText(value: string) {
            this.value += value;
            return this;
        }
    },
    EventEmitter: class EventEmitter<T> {
        private _listeners: Array<(e: T) => any> = [];
        get event() {
            return (listener: (e: T) => any) => {
                this._listeners.push(listener);
                return {
                    dispose: () => {
                        const index = this._listeners.indexOf(listener);
                        if (index > -1) {
                            this._listeners.splice(index, 1);
                        }
                    }
                };
            };
        }
        fire(data: T) {
            for (const listener of this._listeners) {
                try {
                    listener(data);
                } catch (e) {
                    console.error(e);
                }
            }
        }
        dispose() {
            this._listeners = [];
        }
    },
    ProgressLocation: {
        Notification: 15,
    },
    CodeLens: class CodeLens {
        constructor(public range: any, public command?: any) { }
    },
    TreeItem: class TreeItem {
        label: string;
        collapsibleState: any;
        constructor(label: string, collapsibleState: any) {
            this.label = label;
            this.collapsibleState = collapsibleState;
        }
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
    },
    ThemeIcon: class ThemeIcon {
        id: string;
        color?: any;
        constructor(id: string, color?: any) {
            this.id = id;
            this.color = color;
        }
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2,
    },
    languages: {
        registerCodeActionsProvider: () => ({ dispose: () => { } }),
        registerCodeLensProvider: () => ({ dispose: () => { } }),
    }
};

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === "vscode") {
        return mockVscode;
    }
    return originalLoad.apply(this, [request, parent, isMain] as any);
};
