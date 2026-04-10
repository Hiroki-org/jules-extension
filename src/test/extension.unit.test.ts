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

    test("should return the latest valid createTime", () => {
      const activities: Activity[] = [
        { id: "1", name: "1", createTime: "2024-03-24T10:00:00Z" },
        { id: "2", name: "2", createTime: "2024-03-25T10:00:00Z" }, // latest
        { id: "3", name: "3", createTime: "2024-03-23T10:00:00Z" },
      ] as unknown as Activity[];
      const result = getLatestActivityCreateTime(activities);
      assert.strictEqual(result, "2024-03-25T10:00:00Z");
    });


    test("should compare timestamps with timezone offsets correctly", () => {
      const activities: Activity[] = [
        { id: "1", name: "1", createTime: "2024-03-24T18:00:00+09:00" },
        { id: "2", name: "2", createTime: "2024-03-24T10:00:00Z" }, // latest (10:00Z > 09:00Z)
      ] as unknown as Activity[];
      const result = getLatestActivityCreateTime(activities);
      assert.strictEqual(result, "2024-03-24T10:00:00Z");
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
