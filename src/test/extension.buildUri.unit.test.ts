import * as assert from "assert";
import * as vscode from "vscode";
import { JulesActivitiesDocumentProvider } from "../extension";

suite("JulesActivitiesDocumentProvider Test Suite", () => {
    test("should return empty string for unknown URI", () => {
        const provider = new JulesActivitiesDocumentProvider();
        const uri = vscode.Uri.parse("jules-activities://sessions/unknown/activities.log");
        const result = provider.provideTextDocumentContent(uri);
        assert.strictEqual(result, "");
    });

    test("should store and retrieve content for URI", () => {
        const provider = new JulesActivitiesDocumentProvider();
        const uri = vscode.Uri.parse("jules-activities://sessions/test/activities.log");
        provider.setContent(uri, "Test Content");

        const result = provider.provideTextDocumentContent(uri);
        assert.strictEqual(result, "Test Content");
    });

    test("should normalize session ID by removing 'sessions/' prefix", () => {
        const provider = new JulesActivitiesDocumentProvider();
        const sessionIdWithPrefix = "sessions/abc-123-def";
        const uri = provider.buildUri(sessionIdWithPrefix);

        const uriString = uri.toString();
        assert.ok(uriString.startsWith("jules-activities://"), "URI should have 'jules-activities' scheme");
        assert.ok(uriString.includes("abc-123-def"), "URI should include normalized session ID");
        // Verify no double 'sessions/' prefix in the final URI
        assert.ok(uriString.match(/sessions\/.*abc-123-def/), "Should have sessions/ prefix followed by normalized ID");
    });

    test("should handle session ID without 'sessions/' prefix", () => {
        const provider = new JulesActivitiesDocumentProvider();
        const sessionIdWithoutPrefix = "abc-123-def";
        const uri = provider.buildUri(sessionIdWithoutPrefix);

        const uriString = uri.toString();
        assert.ok(uriString.startsWith("jules-activities://"), "URI should have 'jules-activities' scheme");
        assert.ok(uriString.includes("abc-123-def"), "URI should include session ID");
        assert.ok(uriString.endsWith("activities.log"), "URI should end with 'activities.log'");
    });
});
