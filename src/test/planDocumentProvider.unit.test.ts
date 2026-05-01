import * as assert from "assert";
import { formatFullPlan, type Plan, type PlanStep } from "../planUtils";
import { JulesPlanDocumentProvider } from "../planDocumentProvider";

suite("formatFullPlan", () => {
    test("formats plan with all fields", () => {
        const plan = {
            title: "Test Plan",
            steps: [
                { title: "Step 1", description: "Do first thing" },
                { title: "Step 2", description: "Do second thing" },
            ],
        };

        const result = formatFullPlan(plan);

        assert.ok(result.includes("# Plan Review"));
        assert.ok(result.includes("## 📋 Test Plan"));
        assert.ok(result.includes("1. "));
        assert.ok(result.includes("Step 1") || result.includes("Do first thing"));
        assert.ok(result.includes("2. "));
    });

    test("uses session title in header when provided", () => {
        const plan = {
            steps: [{ description: "Do something" }],
        };

        const result = formatFullPlan(plan, "My Session");

        assert.ok(result.includes("# Plan Review: My Session"));
    });

    test("uses default header when session title is missing", () => {
        const plan = {
            steps: [{ description: "Do something" }],
        };

        const result = formatFullPlan(plan);

        assert.ok(result.includes("# Plan Review"));
        assert.ok(!result.includes("# Plan Review:"));
    });

    test("formats steps with only title", () => {
        const plan = {
            title: "Plan",
            steps: [{ title: "Step with only title" }],
        };

        const result = formatFullPlan(plan);

        assert.ok(result.includes("1. Step with only title"));
    });

    test("formats steps with only description", () => {
        const plan = {
            title: "Plan",
            steps: [{ description: "Description only" }],
        };

        const result = formatFullPlan(plan);

        assert.ok(result.includes("1. Description only"));
    });

    test("handles string steps", () => {
        const plan: Plan = {
            title: "Plan",
            steps: ["String step 1", "String step 2"],
        };

        const result = formatFullPlan(plan);

        assert.ok(result.includes("1. String step 1"));
        assert.ok(result.includes("2. String step 2"));
    });

    test("skips empty steps", () => {
        const plan: Plan = {
            title: "Plan",
            steps: [
                { description: "" },
                { description: "Valid step" },
                {},
            ] as PlanStep[],
        };

        const result = formatFullPlan(plan);

        // Should only have one step numbered
        assert.ok(result.includes("1. Valid step"));
        assert.ok(!result.includes("2."));
    });

    test("handles empty steps array", () => {
        const plan = {
            title: "Empty Plan",
            steps: [],
        };

        const result = formatFullPlan(plan);

        assert.ok(result.includes("## 📋 Empty Plan"));
        assert.ok(result.includes("*No steps defined in this plan.*"));
    });

    test("handles undefined steps", () => {
        const plan: Plan = {
            title: "No Steps Plan",
        };

        const result = formatFullPlan(plan);

        assert.ok(result.includes("## 📋 No Steps Plan"));
        assert.ok(result.includes("*No steps defined in this plan.*"));
    });

    test("handles empty plan object gracefully", () => {
        const plan: Plan = {};

        const result = formatFullPlan(plan);

        assert.ok(typeof result === "string");
        assert.ok(result.includes("# Plan Review"));
    });
});

suite("JulesPlanDocumentProvider", () => {
    test("returns content for registered URI", () => {
        const provider = new JulesPlanDocumentProvider();
        const uri = provider.buildUri("test-session-123");
        const content = "# Test Plan\n\nSome content";

        provider.setContent(uri, content);

        const result = provider.provideTextDocumentContent(uri);
        assert.strictEqual(result, content);
    });

    test("returns empty string for unregistered URI", () => {
        const provider = new JulesPlanDocumentProvider();
        const uri = provider.buildUri("unknown-session");

        const result = provider.provideTextDocumentContent(uri);
        assert.strictEqual(result, "");
    });

    test("clears content for URI", () => {
        const provider = new JulesPlanDocumentProvider();
        const uri = provider.buildUri("test-session");
        const content = "# Plan";

        provider.setContent(uri, content);
        provider.clearContent(uri);

        const result = provider.provideTextDocumentContent(uri);
        assert.strictEqual(result, "");
    });

    test("buildUri creates correct URI format", () => {
        const provider = new JulesPlanDocumentProvider();
        const uri = provider.buildUri("session-abc-123");

        // Use toString() for assertion as mock Uri.parse may not set all properties
        const uriString = uri.toString();
        assert.ok(uriString.includes("jules-plan://"));
        assert.ok(uriString.includes("session-abc-123"));
        assert.ok(uriString.endsWith(".md"));
    });

    test("handles multiple sessions independently", () => {
        const provider = new JulesPlanDocumentProvider();
        const uri1 = provider.buildUri("session-1");
        const uri2 = provider.buildUri("session-2");

        provider.setContent(uri1, "Content 1");
        provider.setContent(uri2, "Content 2");

        assert.strictEqual(provider.provideTextDocumentContent(uri1), "Content 1");
        assert.strictEqual(provider.provideTextDocumentContent(uri2), "Content 2");

        provider.clearContent(uri1);
        assert.strictEqual(provider.provideTextDocumentContent(uri1), "");
        assert.strictEqual(provider.provideTextDocumentContent(uri2), "Content 2");
    });
});

import * as vscode from "vscode";
import * as sinon from "sinon";
import { reviewPlanForSession } from "../planDocumentProvider";

suite("reviewPlanForSession", () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test("shows error if session ID is invalid", async () => {
        const showErrorMessageSpy = sandbox.spy(vscode.window, "showErrorMessage");
        
        await reviewPlanForSession({
            sessionId: "../invalid/session",
            plan: { title: "Test" },
            logChannel: { appendLine: () => {} } as any,
            planProvider: new JulesPlanDocumentProvider(),
            onApprove: async () => {}
        });

        assert.ok(showErrorMessageSpy.calledWith("Invalid session ID."));
    });

    test("shows error if no plan is available", async () => {
        const showErrorMessageSpy = sandbox.spy(vscode.window, "showErrorMessage");
        
        await reviewPlanForSession({
            sessionId: "session-123",
            plan: null,
            logChannel: { appendLine: () => {} } as any,
            planProvider: new JulesPlanDocumentProvider(),
            onApprove: async () => {}
        });

        assert.ok(showErrorMessageSpy.calledWith("No plan available for this session."));
    });

    test("formats plan, opens document, and shows approve prompt", async () => {
        const openTextDocumentStub = sandbox.stub(vscode.workspace, "openTextDocument").resolves({} as any);
        const showTextDocumentStub = sandbox.stub(vscode.window, "showTextDocument").resolves({} as any);
        const showInformationMessageStub = sandbox.stub(vscode.window, "showInformationMessage").resolves("Approve Plan" as any);
        
        let onApproveCalled = false;

        const provider = new JulesPlanDocumentProvider();
        const setContentSpy = sandbox.spy(provider, "setContent");
        const clearContentSpy = sandbox.spy(provider, "clearContent");

        await reviewPlanForSession({
            sessionId: "session-123",
            sessionTitle: "My Session",
            plan: { title: "Test Plan", steps: [{ description: "Step 1" }] },
            logChannel: { appendLine: () => {} } as any,
            planProvider: provider,
            onApprove: async (id) => {
                assert.strictEqual(id, "session-123");
                onApproveCalled = true;
            }
        });

        assert.ok(setContentSpy.calledOnce);
        assert.ok(openTextDocumentStub.calledOnce);
        assert.ok(showTextDocumentStub.calledOnce);
        assert.ok(showInformationMessageStub.calledWith(
            "Plan for \"My Session\" is ready for review.",
            { modal: false } as any,
            "Approve Plan" as any
        ));
        assert.ok(onApproveCalled);
        assert.ok(clearContentSpy.calledOnce);
    });

    test("does not call onApprove if dismissed", async () => {
        sandbox.stub(vscode.workspace, "openTextDocument").resolves({} as any);
        sandbox.stub(vscode.window, "showTextDocument").resolves({} as any);
        sandbox.stub(vscode.window, "showInformationMessage").resolves(undefined as any);
        
        let onApproveCalled = false;

        const provider = new JulesPlanDocumentProvider();
        const clearContentSpy = sandbox.spy(provider, "clearContent");

        await reviewPlanForSession({
            sessionId: "session-123",
            plan: { title: "Test Plan", steps: [] },
            logChannel: { appendLine: () => {} } as any,
            planProvider: provider,
            onApprove: async () => {
                onApproveCalled = true;
            }
        });

        assert.ok(!onApproveCalled);
        assert.ok(clearContentSpy.calledOnce);
    });

    test("handles errors gracefully", async () => {
        sandbox.stub(vscode.workspace, "openTextDocument").rejects(new Error("Failed to open"));
        const showErrorMessageSpy = sandbox.spy(vscode.window, "showErrorMessage");
        
        let logMessage = "";
        
        await reviewPlanForSession({
            sessionId: "session-123",
            plan: { title: "Test Plan" },
            logChannel: { appendLine: (msg: string) => { logMessage = msg; } } as any,
            planProvider: new JulesPlanDocumentProvider(),
            onApprove: async () => {}
        });

        assert.ok(showErrorMessageSpy.calledWith("Failed to load plan for review."));
        assert.ok(logMessage.includes("Failed to review plan"));
    });
});

