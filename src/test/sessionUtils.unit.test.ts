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
        const [url, options] = fetchStub.firstCall.args;
        assert.strictEqual(url, "https://jules.googleapis.com/v1alpha/sessions");
        
        const payload = JSON.parse(options.body);
        assert.strictEqual(payload.title, "test title");
        assert.strictEqual(payload.sourceContext.source, "sources/repo");
        assert.strictEqual(payload.automationMode, "MANUAL");
        assert.strictEqual(payload.requirePlanApproval, false);
        assert.strictEqual(payload.sourceContext.githubRepoContext.startingBranch, "main");
        
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

    test("sendMessage succeeds when API returns OK", async () => {
        fetchStub.resolves({
            ok: true,
        } as Response);

        await sendMessage("dummy-key", "sessions/123", "test message");

        assert.ok(fetchStub.calledOnce);
        const [url, options] = fetchStub.firstCall.args;
        assert.strictEqual(url, "https://jules.googleapis.com/v1alpha/sessions/123:sendMessage");
        
        const payload = JSON.parse(options.body);
        assert.strictEqual(payload.prompt, "test message");
    });

    test("sendMessage throws error when API fails", async () => {
        fetchStub.resolves({
            ok: false,
            status: 404,
            statusText: "Not Found",
            text: async () => "Session not found",
        } as Response);

        try {
            await sendMessage("dummy-key", "sessions/123", "test message");
            assert.fail("Should have thrown error");
        } catch (error: any) {
            assert.ok(error.message.includes("Session not found"));
        }
    });
});
