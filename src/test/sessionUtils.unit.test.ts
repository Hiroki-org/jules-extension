import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { createJulesSession } from "../sessionUtils";
import * as fetchUtils from "../fetchUtils";

suite("sessionUtils Test Suite", () => {
    let fetchStub: sinon.SinonStub;
    let windowProgressStub: sinon.SinonStub;

    setup(() => {
        windowProgressStub = sinon.stub(vscode.window, "withProgress").callsFake((opts, task) => {
            return task({ report: () => {} } as any, {} as any);
        });
        fetchStub = sinon.stub(fetchUtils, "fetchWithTimeout");
    });

    teardown(() => {
        sinon.restore();
    });

    test("createJulesSession succeeds when valid response is returned", async () => {
        fetchStub.resolves({
            ok: true,
            json: async () => ({ name: "sessions/test-123" })
        } as any);

        const context = { globalState: { update: sinon.stub() } } as any;
        const result = await createJulesSession(context, { name: "sources/123" } as any, "dummy-key", "main", "test prompt", "test title", "MANUAL");

        assert.strictEqual(result, "sessions/test-123");
    });

    test("createJulesSession throws error when response is not ok", async () => {
        fetchStub.resolves({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            text: async () => "error body"
        } as any);

        const context = { globalState: { update: sinon.stub() } } as any;

        try {
            await createJulesSession(context, { name: "sources/123" } as any, "dummy-key", "main", "test prompt", "test title", "MANUAL");
            assert.fail("Should have thrown error");
        } catch (error: any) {
            assert.ok(error.message.includes("Failed to create session: 400 Bad Request - error body"));
        }
    });

    test("createJulesSession throws error when session.name is missing or invalid", async () => {
        fetchStub.resolves({
            ok: true,
            json: async () => ({})
        } as any);

        const context = { globalState: { update: sinon.stub() } } as any;

        try {
            await createJulesSession(context, { name: "sources/123" } as any, "dummy-key", "main", "test prompt", "test title", "MANUAL");
            assert.fail("Should have thrown error");
        } catch (error: any) {
            assert.strictEqual(error.message, "Invalid response: session name is missing.");
        }
    });
});
