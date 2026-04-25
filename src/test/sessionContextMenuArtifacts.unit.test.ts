import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as path from "path";
import { resolveWorkspaceFile, JulesDiffDocumentProvider } from "../sessionContextMenuArtifacts";

suite("Session Context Menu Artifacts Security Suite", () => {
    let sandbox: sinon.SinonSandbox;
    let fsStatStub: sinon.SinonStub;
    let workspaceFoldersStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();

        // Stub workspace folders
        workspaceFoldersStub = sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);

        // Create a mock FS object
        const mockFs = {
            stat: sandbox.stub(),
            readDirectory: sandbox.stub(),
            readFile: sandbox.stub(),
            writeFile: sandbox.stub(),
            delete: sandbox.stub(),
            rename: sandbox.stub(),
            copy: sandbox.stub(),
            createDirectory: sandbox.stub(),
            isWritableFileSystem: sandbox.stub()
        };

        // Stub vscode.workspace.fs with our mock
        // We use 'get' accessor stub if it's a property, or verify if we can just set value
        // If vscode.workspace is frozen, this might fail too. 
        // But typically the 'vscode' object imported in tests is a proxy or can be shadowed? 
        // Actually inside vscode-test, 'vscode' is the real API.

        // Attempt to stub 'fs' property on vscode.workspace
        try {
            sandbox.stub(vscode.workspace, 'fs').value(mockFs);
        } catch (e) {
            // If 'fs' is not configurable, we might need a workaround.
            // But let's try this first.
            console.error("Failed to stub vscode.workspace.fs:", e);
        }

        fsStatStub = mockFs.stat;
    });

    teardown(() => {
        sandbox.restore();
    });

    test("should reject absolute paths", async () => {
        const absPath = path.resolve("/etc/passwd"); // Ensure it's absolute for current OS
        const result = await resolveWorkspaceFile(absPath);
        assert.strictEqual(result, null, "Should return null for absolute paths");
        assert.strictEqual(fsStatStub.called, false, "Should not attempt to stat absolute path");
    });

    test("should reject path traversal attempts that go outside workspace", async () => {
        const rootPath = path.resolve("/workspace");
        const folder = {
            uri: vscode.Uri.file(rootPath),
            name: "root",
            index: 0
        };
        workspaceFoldersStub.value([folder]);

        // Target: ../secret.txt (relative to workspace root)
        const targetPath = "../secret.txt";

        const result = await resolveWorkspaceFile(targetPath);
        assert.strictEqual(result, null, "Should reject traversal");
        assert.strictEqual(fsStatStub.called, false, "Should not attempt to stat traversed path");
    });

    test("should allow valid paths within workspace", async () => {
        const rootPath = path.resolve("/workspace");
        const folder = {
            uri: vscode.Uri.file(rootPath),
            name: "root",
            index: 0
        };
        workspaceFoldersStub.value([folder]);

        const targetPath = "src/main.ts";
        const resolvedPath = path.resolve(rootPath, targetPath);
        const resolvedUri = vscode.Uri.file(resolvedPath);

        // Simulate file exists
        fsStatStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath === resolvedUri.fsPath)).resolves({ type: vscode.FileType.File });

        const result = await resolveWorkspaceFile(targetPath);

        assert.ok(result, "Should resolve valid path");
        assert.strictEqual(result.fsPath, resolvedUri.fsPath);
    });

    test("should handle missing files gracefully", async () => {
        const rootPath = path.resolve("/workspace");
        const folder = {
            uri: vscode.Uri.file(rootPath),
            name: "root",
            index: 0
        };
        workspaceFoldersStub.value([folder]);

        const targetPath = "src/missing.ts";

        // Simulate file NOT found (reject promise)
        fsStatStub.rejects(vscode.FileSystemError.FileNotFound());

        const result = await resolveWorkspaceFile(targetPath);

        assert.strictEqual(result, null, "Should return null for missing file");
    });

    test("should check multiple workspace folders", async () => {
        const root1 = path.resolve("/workspace1");
        const root2 = path.resolve("/workspace2");

        const folder1 = { uri: vscode.Uri.file(root1), name: "w1", index: 0 };
        const folder2 = { uri: vscode.Uri.file(root2), name: "w2", index: 1 };

        workspaceFoldersStub.value([folder1, folder2]);

        const targetPath = "shared/config.json";

        // Fail on folder1
        const uri1 = vscode.Uri.file(path.resolve(root1, targetPath));
        fsStatStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath === uri1.fsPath)).rejects(vscode.FileSystemError.FileNotFound());

        // Success on folder2
        const uri2 = vscode.Uri.file(path.resolve(root2, targetPath));
        fsStatStub.withArgs(sinon.match((uri: vscode.Uri) => uri.fsPath === uri2.fsPath)).resolves({ type: vscode.FileType.File });

        const result = await resolveWorkspaceFile(targetPath);

        assert.ok(result, "Should verify existence in second folder");
        assert.strictEqual(result.fsPath, uri2.fsPath);
    });
});

suite("JulesDiffDocumentProvider", () => {
    let provider: JulesDiffDocumentProvider;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        provider = new JulesDiffDocumentProvider();
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test("should return empty string for unknown URI", () => {
        const uri = vscode.Uri.parse("jules-diff://sessions/unknown/after.patch");
        const content = provider.provideTextDocumentContent(uri);
        assert.strictEqual(content, "");
    });

    test("should store and retrieve content for URI", () => {
        const uri = vscode.Uri.parse("jules-diff://sessions/test-123/after.patch");
        const testContent = "diff --git a/file.ts b/file.ts";
        
        provider.setContent(uri, testContent);
        const retrieved = provider.provideTextDocumentContent(uri);
        
        assert.strictEqual(retrieved, testContent);
    });

    test("should build correct URI for before patch", () => {
        const sessionId = "sessions/test-456";
        const uri = provider.buildUri(sessionId, "before");
        
        const uriString = uri.toString();
        assert.strictEqual(uriString.includes("jules-diff"), true);
        assert.strictEqual(uriString.includes("test-456"), true);
        assert.strictEqual(uriString.includes("before.patch"), true);
    });

    test("should build correct URI for after patch", () => {
        const sessionId = "sessions/test-789";
        const uri = provider.buildUri(sessionId, "after");
        
        const uriString = uri.toString();
        assert.strictEqual(uriString.includes("jules-diff"), true);
        assert.strictEqual(uriString.includes("test-789"), true);
        assert.strictEqual(uriString.includes("after.patch"), true);
    });

    test("should normalize session ID by removing 'sessions/' prefix", () => {
        const sessionIdWithPrefix = "sessions/abc-123-def";
        const uri = provider.buildUri(sessionIdWithPrefix, "after");
        
        const uriString = uri.toString();
        // Should not have double 'sessions/' prefix
        assert.strictEqual((uriString.match(/sessions/g) || []).length, 1);
        assert.strictEqual(uriString.includes("abc-123-def"), true);
    });

    test("should handle session ID without 'sessions/' prefix", () => {
        const sessionIdWithoutPrefix = "abc-123-def";
        const uri = provider.buildUri(sessionIdWithoutPrefix, "before");
        
        const uriString = uri.toString();
        assert.strictEqual(uriString.includes("abc-123-def"), true);
        assert.strictEqual(uriString.includes("before.patch"), true);
    });

    test("should maintain separate content for different URIs", () => {
        const uri1 = vscode.Uri.parse("jules-diff://sessions/session1/before.patch");
        const uri2 = vscode.Uri.parse("jules-diff://sessions/session1/after.patch");
        const uri3 = vscode.Uri.parse("jules-diff://sessions/session2/after.patch");
        
        provider.setContent(uri1, "content1");
        provider.setContent(uri2, "content2");
        provider.setContent(uri3, "content3");
        
        assert.strictEqual(provider.provideTextDocumentContent(uri1), "content1");
        assert.strictEqual(provider.provideTextDocumentContent(uri2), "content2");
        assert.strictEqual(provider.provideTextDocumentContent(uri3), "content3");
    });

    test("should overwrite existing content", () => {
        const uri = vscode.Uri.parse("jules-diff://sessions/test/after.patch");
        
        provider.setContent(uri, "original");
        assert.strictEqual(provider.provideTextDocumentContent(uri), "original");
        
        provider.setContent(uri, "updated");
        assert.strictEqual(provider.provideTextDocumentContent(uri), "updated");
    });
});
