import * as assert from "assert";
import { getLatestProgressActivity } from "../extension";
import { Activity } from "../types";

suite("Extension Unit Tests - getLatestProgressActivity", () => {
  test("should return undefined for empty array", () => {
    assert.strictEqual(getLatestProgressActivity([]), undefined);
  });

  test("should return undefined if no activities have progressUpdated", () => {
    const activities: Activity[] = [
      { id: "1", name: "1", createTime: "2024-03-24T10:00:00Z" } as unknown as Activity
    ];
    assert.strictEqual(getLatestProgressActivity(activities), undefined);
  });

  test("should handle missing createTime", () => {
    const activities: Activity[] = [
      { id: "1", name: "1", progressUpdated: { title: "x" } } as unknown as Activity
    ];
    assert.strictEqual(getLatestProgressActivity(activities), undefined);
  });

  test("should handle invalid createTime", () => {
    const activities: Activity[] = [
      { id: "1", name: "1", createTime: "invalid", progressUpdated: { title: "x" } } as unknown as Activity
    ];
    assert.strictEqual(getLatestProgressActivity(activities), undefined);
  });


  test("should compare progress timestamps with timezone offsets correctly", () => {
    const activities: Activity[] = [
      { id: "1", name: "1", createTime: "2024-03-24T18:00:00+09:00", progressUpdated: { title: "A" } } as unknown as Activity,
      { id: "2", name: "2", createTime: "2024-03-24T10:00:00Z", progressUpdated: { title: "B" } } as unknown as Activity,
    ];
    const result = getLatestProgressActivity(activities);
    assert.strictEqual(result?.id, "2");
  });
  test("should return latest progress activity", () => {
    const activities: Activity[] = [
      { id: "1", name: "1", createTime: "2024-03-23T10:00:00Z", progressUpdated: { title: "Old" } } as unknown as Activity,
      { id: "2", name: "2", createTime: "2024-03-25T10:00:00Z", progressUpdated: { title: "Newest" } } as unknown as Activity,
      { id: "3", name: "3", createTime: "2024-03-24T10:00:00Z", progressUpdated: { title: "Newer" } } as unknown as Activity,
    ];
    const result = getLatestProgressActivity(activities);
    assert.strictEqual(result?.id, "2");
  });
});
