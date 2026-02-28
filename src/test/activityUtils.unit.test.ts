import * as assert from "assert";
import {
    getActivityCategory,
    getActivityLabelPrefix,
    getActivitySummaryText,
} from "../activityUtils";
import type { Activity } from "../types";

function mockActivity(overrides: Partial<Activity> = {}): Activity {
    return {
        name: "sessions/s1/activities/a1",
        id: "a1",
        description: "test",
        createTime: "2026-03-01T00:00:00Z",
        originator: "agent",
        artifacts: [],
        ...overrides,
    } as Activity;
}

suite("activityUtils getActivityCategory", () => {
    test("sessionFailed -> Errors (highest priority)", () => {
        const activity = mockActivity({ sessionFailed: { reason: "timeout" } });
        assert.strictEqual(getActivityCategory(activity), "Errors");
    });

    test("planGenerated -> Plan", () => {
        const activity = mockActivity({
            planGenerated: { plan: { title: "p1", steps: [] } as any },
        });
        assert.strictEqual(getActivityCategory(activity), "Plan");
    });

    test("planApproved -> Plan", () => {
        const activity = mockActivity({ planApproved: { planId: "p1" } });
        assert.strictEqual(getActivityCategory(activity), "Plan");
    });

    test("progressUpdated -> Progress", () => {
        const activity = mockActivity({
            progressUpdated: { title: "Working...", description: "" },
        });
        assert.strictEqual(getActivityCategory(activity), "Progress");
    });

    test("sessionCompleted -> Progress", () => {
        const activity = mockActivity({ sessionCompleted: {} });
        assert.strictEqual(getActivityCategory(activity), "Progress");
    });

    test("agentMessaged -> Messages", () => {
        const activity = mockActivity({ agentMessaged: { agentMessage: "Hello" } });
        assert.strictEqual(getActivityCategory(activity), "Messages");
    });

    test("userMessaged -> Messages", () => {
        const activity = mockActivity({ userMessaged: {} });
        assert.strictEqual(getActivityCategory(activity), "Messages");
    });

    test("artifacts with changeSet -> Artifacts", () => {
        const activity = mockActivity({
            artifacts: [
                {
                    changeSet: {
                        source: "s1",
                        gitPatch: {
                            unidiffPatch: "",
                            baseCommitId: "",
                            suggestedCommitMessage: "",
                        },
                    },
                },
            ],
        });
        assert.strictEqual(getActivityCategory(activity), "Artifacts");
    });

    test("artifacts with bashOutput -> Artifacts", () => {
        const activity = mockActivity({
            artifacts: [
                {
                    bashOutput: {
                        command: "ls",
                        output: "",
                        exitCode: 0,
                    },
                },
            ],
        });
        assert.strictEqual(getActivityCategory(activity), "Artifacts");
    });

    test("empty activity -> Messages fallback", () => {
        const activity = mockActivity();
        assert.strictEqual(getActivityCategory(activity), "Messages");
    });
});

suite("activityUtils getActivityLabelPrefix", () => {
    test("planGenerated has Plan prefix", () => {
        const activity = mockActivity({
            planGenerated: { plan: { title: "p1", steps: [] } as any },
        });
        assert.strictEqual(getActivityLabelPrefix(activity), "Plan: ");
    });

    test("sessionFailed has FAILED prefix", () => {
        const activity = mockActivity({ sessionFailed: { reason: "error" } });
        assert.strictEqual(getActivityLabelPrefix(activity), "FAILED: ");
    });
});

suite("activityUtils getActivitySummaryText", () => {
    test("uses progress title first", () => {
        const activity = mockActivity({
            progressUpdated: { title: "Build running", description: "desc" },
        });
        assert.strictEqual(getActivitySummaryText(activity), "Build running");
    });

    test("sessionFailed with reason", () => {
        const activity = mockActivity({
            sessionFailed: { reason: "Rate limit exceeded" },
        });
        assert.strictEqual(
            getActivitySummaryText(activity),
            "Session failed: Rate limit exceeded",
        );
    });

    test("sessionFailed with empty reason", () => {
        const activity = mockActivity({ sessionFailed: { reason: "" } });
        assert.strictEqual(getActivitySummaryText(activity), "Session failed");
    });

    test("sessionFailed with whitespace-only reason", () => {
        const activity = mockActivity({ sessionFailed: { reason: "   " } });
        assert.strictEqual(getActivitySummaryText(activity), "Session failed");
    });
});
