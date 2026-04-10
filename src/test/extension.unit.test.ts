import * as assert from "assert";
import { getLatestActivityCreateTime } from "../extension";
import { Activity } from "../types";

suite("Extension Unit Tests", () => {
  suite("getLatestActivityCreateTime", () => {
    test("should return undefined for empty activities", () => {
      const result = getLatestActivityCreateTime([]);
      assert.strictEqual(result, undefined);
    });

    test("should ignore activities without createTime", () => {
      const activities: Activity[] = [
        { id: "1", name: "1", createTime: "" },
      ] as unknown as Activity[];
      const result = getLatestActivityCreateTime(activities);
      assert.strictEqual(result, undefined);
    });

    test("should handle invalid date strings gracefully", () => {
      const activities: Activity[] = [
        { id: "1", name: "1", createTime: "invalid-date" },
      ] as unknown as Activity[];
      const result = getLatestActivityCreateTime(activities);
      assert.strictEqual(result, undefined);
    });

    test("should return the latest valid createTime using parsed timestamps", () => {
      const activities: Activity[] = [
        { id: "1", name: "1", createTime: "2026-02-28T10:00:00Z" },
        { id: "2", name: "2", createTime: "2026-02-28T10:00:00.100Z" }, // latest based on parse, earlier string may be "larger" if formatted weirdly
        { id: "3", name: "3", createTime: "2026-02-28T09:00:00Z" },
      ] as unknown as Activity[];
      const result = getLatestActivityCreateTime(activities);
      assert.strictEqual(result, "2026-02-28T10:00:00.100Z");
    });

    test("should handle timezone offsets correctly", () => {
      const activities: Activity[] = [
        { id: "1", name: "1", createTime: "2026-02-28T10:00:00Z" }, // 10:00 UTC
        { id: "2", name: "2", createTime: "2026-02-28T10:00:00+02:00" }, // 08:00 UTC
        { id: "3", name: "3", createTime: "2026-02-28T06:00:00-05:00" }, // 11:00 UTC (latest)
      ] as unknown as Activity[];
      const result = getLatestActivityCreateTime(activities);
      assert.strictEqual(result, "2026-02-28T06:00:00-05:00");
    });

    test("should fallback properly for edge cases", () => {
      const activities: Activity[] = [
        { id: "1", name: "1", createTime: "invalid" },
        { id: "2", name: "2", createTime: "2024-03-25T10:00:00Z" }, // latest
      ] as unknown as Activity[];
      const result = getLatestActivityCreateTime(activities);
      assert.strictEqual(result, "2024-03-25T10:00:00Z");
    });
  });
});
