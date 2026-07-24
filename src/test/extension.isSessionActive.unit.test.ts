import * as assert from "assert";
import { isSessionActive } from "../extension";
import { Session } from "../types";

suite("extension.isSessionActive Unit Tests", () => {
    test("returns true for active states", () => {
        const activeStates = [
            "IN_PROGRESS",
            "QUEUED",
            "PLANNING",
            "AWAITING_PLAN_APPROVAL",
            "AWAITING_USER_FEEDBACK",
        ];
        for (const state of activeStates) {
            const session = { rawState: state } as Session;
            assert.strictEqual(isSessionActive(session), true, `State ${state} should be active`);
        }
    });

    test("returns false for inactive states", () => {
        const inactiveStates = [
            "COMPLETED",
            "FAILED",
            "CANCELLED",
            "UNKNOWN_STATE",
            "",
            undefined
        ];
        for (const state of inactiveStates) {
            const session = { rawState: state } as any as Session;
            assert.strictEqual(isSessionActive(session), false, `State ${state} should be inactive`);
        }
    });
});
