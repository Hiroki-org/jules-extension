import * as assert from "assert";
import { isSessionActive } from "../extension";
import { Session } from "../types";

suite("extension.ts - isSessionActive", () => {
  test("should return true for active states", () => {
    const states = [
      "IN_PROGRESS",
      "QUEUED",
      "PLANNING",
      "AWAITING_PLAN_APPROVAL",
      "AWAITING_USER_FEEDBACK",
    ];

    for (const state of states) {
      assert.strictEqual(isSessionActive({ rawState: state } as Session), true);
    }
  });

  test("should return false for non-active states", () => {
    const states = [
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "UNKNOWN_STATE",
      "",
    ];

    for (const state of states) {
      assert.strictEqual(isSessionActive({ rawState: state } as Session), false);
    }
  });
});
