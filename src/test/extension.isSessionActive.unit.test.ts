import * as assert from "assert";
import { isSessionActive } from "../extension";
import { Session } from "../types";

suite("isSessionActive unit test", () => {
  test("should return true for active states", () => {
    assert.strictEqual(isSessionActive({ rawState: "IN_PROGRESS" } as Session), true);
    assert.strictEqual(isSessionActive({ rawState: "QUEUED" } as Session), true);
    assert.strictEqual(isSessionActive({ rawState: "PLANNING" } as Session), true);
    assert.strictEqual(isSessionActive({ rawState: "AWAITING_PLAN_APPROVAL" } as Session), true);
    assert.strictEqual(isSessionActive({ rawState: "AWAITING_USER_FEEDBACK" } as Session), true);
  });

  test("should return false for inactive states", () => {
    assert.strictEqual(isSessionActive({ rawState: "COMPLETED" } as Session), false);
    assert.strictEqual(isSessionActive({ rawState: "FAILED" } as Session), false);
    assert.strictEqual(isSessionActive({ rawState: "TERMINATED" } as Session), false);
    assert.strictEqual(isSessionActive({ rawState: "UNKNOWN" } as Session), false);
  });
});
