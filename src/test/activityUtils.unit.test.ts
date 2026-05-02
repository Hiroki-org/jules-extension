import * as assert from "assert";
import {
    getActivityCategory,
    getActivityIcon,
    getActivityLabelPrefix,
    getActivitySummaryText,
    isActivityCorrupted,
    summarizeArtifacts,
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

    test("planApproved -> Approved: ", () => {
        assert.strictEqual(getActivityLabelPrefix(mockActivity({ planApproved: { planId: "p1" } })), "Approved: ");
    });

    test("sessionCompleted -> Completed: ", () => {
        assert.strictEqual(getActivityLabelPrefix(mockActivity({ sessionCompleted: {} })), "Completed: ");
    });

    test("artifacts with changeSet -> (diff) ", () => {
        assert.strictEqual(
            getActivityLabelPrefix(
                mockActivity({ artifacts: [{ changeSet: { source: "s1" } as any }] }),
            ),
            "(diff) ",
        );
    });

    test("agentMessaged -> empty prefix", () => {
        assert.strictEqual(getActivityLabelPrefix(mockActivity({ agentMessaged: { agentMessage: "hello" } })), "");
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

suite("activityUtils getActivityIcon", () => {
    test("returns the plan generated icon", () => {
        assert.strictEqual(
            getActivityIcon(mockActivity({ planGenerated: { plan: { title: "p1", steps: [] } as any } })),
            "📝",
        );
    });

    test("returns the plan approved icon", () => {
        assert.strictEqual(
            getActivityIcon(mockActivity({ planApproved: { planId: "p1" } })),
            "👍",
        );
    });

    test("returns the progress updated icon", () => {
        assert.strictEqual(
            getActivityIcon(mockActivity({ progressUpdated: { title: "Working", description: "" } })),
            "🔄",
        );
    });

    test("returns the session completed icon", () => {
        assert.strictEqual(
            getActivityIcon(mockActivity({ sessionCompleted: {} })),
            "✅",
        );
    });

    test("returns the session failed icon", () => {
        assert.strictEqual(
            getActivityIcon(mockActivity({ sessionFailed: { reason: "boom" } })),
            "❌",
        );
    });

    test("returns the agent messaged icon", () => {
        assert.strictEqual(
            getActivityIcon(mockActivity({ agentMessaged: { agentMessage: "hello" } })),
            "💬",
        );
    });

    test("returns the user messaged icon", () => {
        assert.strictEqual(
            getActivityIcon(mockActivity({ userMessaged: {} })),
            "🗨️",
        );
    });

    test("returns the fallback icon when multiple active keys are present", () => {
        assert.strictEqual(
            getActivityIcon(mockActivity({ agentMessaged: { agentMessage: "hi" }, userMessaged: {} })),
            "ℹ️",
        );
    });

    test("returns the fallback icon when no active key is present", () => {
        assert.strictEqual(getActivityIcon(mockActivity()), "ℹ️");
    });
});

suite("activityUtils summarizeArtifacts", () => {
    test("returns null for empty inputs and summarizes unique artifact types in insertion order", () => {
        assert.strictEqual(summarizeArtifacts(undefined), null);
        assert.strictEqual(summarizeArtifacts([]), null);
        assert.strictEqual(summarizeArtifacts([{}]), null);
        assert.strictEqual(
            summarizeArtifacts([
                { changeSet: {} },
                { bashOutput: { command: "pnpm test" } as any },
                { media: { uri: "file:///tmp/screenshot.png" } },
                { changeSet: {} },
            ]),
            "Artifacts: changeSet, bashOutput, media",
        );
    });
});

suite("activityUtils isActivityCorrupted", () => {
    test("returns false for a completely valid activity with matching type and payload", () => {
        const activity = mockActivity({
            type: "planGenerated",
            planGenerated: { plan: { title: "p1", steps: [] } as any },
        });
        assert.strictEqual(isActivityCorrupted(activity), false);
    });

    test("returns true for a corrupted activity missing its payload", () => {
        const activity = mockActivity({
            type: "planGenerated",
            // Notice: no planGenerated field is present
        });
        assert.strictEqual(isActivityCorrupted(activity), true);
    });

    test("returns false when type is undefined but some other payload exists", () => {
        const activity = mockActivity({
            type: undefined,
            agentMessaged: { agentMessage: "Hello" },
        });
        assert.strictEqual(isActivityCorrupted(activity), false);
    });

    test("returns false when type does not belong to union keys", () => {
        const activity = mockActivity({
            type: "customUnknownType",
        });
        assert.strictEqual(isActivityCorrupted(activity), false);
    });
});
