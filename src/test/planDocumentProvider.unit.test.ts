import * as assert from "assert";
import * as vscode from "vscode";
import { JulesPlanDocumentProvider } from "../planDocumentProvider";

suite("JulesPlanDocumentProvider", () => {
    test("returns default content when empty", () => {
        const provider = new JulesPlanDocumentProvider();
        const uri = vscode.Uri.parse("jules-plan://authority/test.md");
        assert.strictEqual(provider.provideTextDocumentContent(uri), "No plan content available.");
    });

    test("sets and retrieves content", () => {
        const provider = new JulesPlanDocumentProvider();
        const uri = vscode.Uri.parse("jules-plan://authority/test.md");
        const content = "# Test Plan";

        let eventFired = false;
        provider.onDidChange((e) => {
            if (e.toString() === uri.toString()) {
                eventFired = true;
            }
        });

        provider.setContent(uri, content);
        assert.strictEqual(provider.provideTextDocumentContent(uri), content);
        assert.strictEqual(eventFired, true);
    });

    test("builds correct URI", () => {
        const provider = new JulesPlanDocumentProvider();
        const uri = provider.buildUri("sessions/123");
        assert.strictEqual(uri.scheme, "jules-plan");
        assert.ok(uri.path.includes("123"));
    });
});
