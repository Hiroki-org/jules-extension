import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import { createJulesSession, sendMessage } from "../sessionUtils";
import * as fetchUtils from "../fetchUtils";

suite("sessionUtils Test Suite", () => {
    let fetchStub: sinon.SinonStub;
    let windowProgressStub: sinon.SinonStub;

    setup(() => {
        fetchStub = sinon.stub(fetchUtils, "fetchWithTimeout");
        windowProgressStub = sinon.stub(vscode.window, "withProgress");
    });

    teardown(() => {
        sinon.restore();
    });

    test("createJulesSession succeeds when valid response is returned", async () => {
        const mockSession = { name: "sessions/123" };
        fetchStub.resolves({
            ok: true,
            json: async () => mockSession,
        } as Response);

        windowProgressStub.callsFake(async (options, task) => {
            return await task({ report: sinon.stub() } as any, new vscode.CancellationTokenSource().token);
        });

        const context = {
            globalState: {
                update: sinon.stub().resolves(),
            },
        } as any;

        const sessionId = await createJulesSession(
            context,
            { name: "sources/repo" } as any,
            "dummy-key",
            "main",
            "test prompt",
            "test title",
            "MANUAL"
        );

        assert.strictEqual(sessionId, "sessions/123");
        assert.ok(fetchStub.calledOnce);
        assert.ok(context.globalState.update.calledWith("active-session-id", "sessions/123"));
    });

    test("createJulesSession throws error when response is not ok", async () => {
        fetchStub.resolves({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            text: async () => "Error body",
        } as Response);

        windowProgressStub.callsFake(async (options, task) => {
            return await task({ report: sinon.stub() } as any, new vscode.CancellationTokenSource().token);
        });

        const context = { globalState: { update: sinon.stub() } } as any;

        try {
            await createJulesSession(context, { name: "sources/123" } as any, "dummy-key", "main", "test prompt", "test title", "MANUAL");
            assert.fail("Should have thrown error");
        } catch (error: any) {
            assert.ok(error.message.includes("API Error: Error body"));
        }
    });

    test("sendMessage succeeds with 2xx response", async () => {
        fetchStub.resolves({
            ok: true,
            json: async () => ({}),
        } as Response);

        await sendMessage("dummy-key", "sessions/123", "test prompt");

        assert.ok(fetchStub.calledOnce);
        const [url, options] = fetchStub.getCall(0).args;
        assert.ok(url.includes("sessions/123:sendMessage"));
        assert.strictEqual(options.method, "POST");
        const body = JSON.parse(options.body);
        assert.strictEqual(body.prompt, "test prompt");
    });

    test("sendMessage throws error when response is not ok", async () => {
        fetchStub.resolves({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            text: async () => "Invalid prompt",
        } as Response);

        try {
            await sendMessage("dummy-key", "sessions/123", "test prompt");
            assert.fail("Should have thrown error");
        } catch (error: any) {
            assert.strictEqual(error.message, "Invalid prompt");
        }
    });
});
