import * as assert from "assert";
import { isSessionActive } from "../extension";
import { Session } from "../types";

suite("extension.ts isSessionActive Test Suite", () => {
    const createMockSession = (rawState: string): Session => {
        return {
            id: "test-session",
            name: "Test Session",
            rawState,
            state: "IN_PROGRESS", // Not used in isSessionActive
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isArchived: false,
            workspaceId: "ws-123"
        } as unknown as Session;
    };

    test("should return true for active states", () => {
        const activeStates = [
            "IN_PROGRESS",
            "QUEUED",
            "PLANNING",
            "AWAITING_PLAN_APPROVAL",
            "AWAITING_USER_FEEDBACK",
        ];

        for (const state of activeStates) {
            const session = createMockSession(state);
            assert.strictEqual(isSessionActive(session), true, `State ${state} should be considered active`);
        }
    });

    test("should return false for inactive states", () => {
        const inactiveStates = [
            "COMPLETED",
            "FAILED",
            "CANCELLED",
            "UNKNOWN_STATE",
            ""
        ];

        for (const state of inactiveStates) {
            const session = createMockSession(state);
            assert.strictEqual(isSessionActive(session), false, `State ${state} should be considered inactive`);
        }
    });
});
