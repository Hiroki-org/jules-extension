import Module from "module";

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
            get: () => undefined,
        }),
        onDidChangeConfiguration: () => ({ dispose: () => { } }),
        openTextDocument: async () => ({}) as any,
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
        withProgress: async (_opts: any, task: any) => task(),
        showTextDocument: async () => undefined,
        activeTextEditor: undefined,
        createTreeView: () => ({ dispose: () => { } }),
        createStatusBarItem: () => ({ show: () => { }, dispose: () => { } }),
        createOutputChannel: () => ({ appendLine: () => { }, clear: () => { }, show: () => { }, dispose: () => { } }),
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
    MarkdownString: class MarkdownString {
        value: string;
        constructor(value: string = '') {
            this.value = value;
        }
        appendMarkdown(value: string) {
            this.value += value;
        }
    },
    EventEmitter: class EventEmitter {
        event: any;
        constructor() {
            this.event = () => ({ dispose: () => { } });
        }
        fire() { }
    },
    ProgressLocation: {
        Notification: 15,
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
};

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === "vscode") {
        return mockVscode;
    }
    return originalLoad.apply(this, [request, parent, isMain] as any);
};
