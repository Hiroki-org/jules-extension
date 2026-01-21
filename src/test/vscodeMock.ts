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
        openTextDocument: async () => ({}) as any,
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
    },
    env: {
        openExternal: async () => true,
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
        constructor(value: string) {
            this.value = value;
        }
    },
    ProgressLocation: {
        Notification: 15,
    },
};

const originalLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === "vscode") {
        return mockVscode;
    }
    return originalLoad.apply(this, [request, parent, isMain] as any);
};
