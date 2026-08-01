import * as assert from "assert";
import { isSessionActive } from "../extension";
import { Session } from "../types";

suite("extension isSessionActive Unit Tests", () => {
  test("should return true for active session states", () => {
    const activeStates = [
      "IN_PROGRESS",
      "QUEUED",
      "PLANNING",
      "AWAITING_PLAN_APPROVAL",
      "AWAITING_USER_FEEDBACK",
    ];

    for (const state of activeStates) {
      const session = { rawState: state } as Session;
      assert.strictEqual(
        isSessionActive(session),
        true,
        `Expected ${state} to be active`,
      );
    }
  });

  test("should return false for inactive session states", () => {
    const inactiveStates = ["PAUSED", "COMPLETED", "FAILED", "CANCELLED", "UNKNOWN_STATE"];

    for (const state of inactiveStates) {
      const session = { rawState: state } as Session;
      assert.strictEqual(
        isSessionActive(session),
        false,
        `Expected ${state} to be inactive`,
      );
    }
  });
});
