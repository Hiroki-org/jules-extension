import * as assert from "assert";
import { Activity } from "../types";
import {
  mergeActivitiesByIdentity,
  buildActivitySummaryHeader,
} from "../extension";

suite("mergeActivitiesByIdentity Unit Tests", () => {
  test("should return existing when incoming is empty", () => {
    const existing = [{ name: "1", createTime: "2026-01-01T00:00:00Z" }] as any;
    const incoming: any[] = [];
    const merged = mergeActivitiesByIdentity(existing, incoming);
    assert.strictEqual(merged, existing);
  });

  test("should correctly calculate counts and buildActivitySummaryHeader should use them", () => {
    const existing = [
      { name: "1", createTime: "2026-01-01T00:00:00Z", planGenerated: {} }, // Category: Plan
      { name: "2", createTime: "2026-01-01T00:01:00Z", progressUpdated: {} }, // Category: Progress
    ] as any;

    const incoming = [
      {
        name: "2",
        createTime: "2026-01-01T00:01:00Z",
        sessionFailed: { reason: "test" },
      }, // Changed to Errors
      {
        name: "3",
        createTime: "2026-01-01T00:02:00Z",
        artifacts: [{ changeSet: {} }],
      }, // Category: Artifacts
    ] as any;

    // First call with existing to seed the WeakMap
    const firstMerge = mergeActivitiesByIdentity([], existing);
    const summary1 = buildActivitySummaryHeader("RUNNING", firstMerge);
    assert.ok(summary1.includes("Plan: 1"));
    assert.ok(summary1.includes("Progress: 1"));

    // Second call merging incoming with existing
    const merged = mergeActivitiesByIdentity(firstMerge, incoming);

    const summary = buildActivitySummaryHeader("RUNNING", merged);

    assert.ok(summary.includes("Plan: 1"));
    assert.ok(summary.includes("Progress: 0")); // Because activity 2 was overwritten
    assert.ok(summary.includes("Errors: 1"));
    assert.ok(summary.includes("Artifacts: 1"));
  });

  test("should count only merged activities when existing contains duplicate keys", () => {
    const existing: Activity[] = [
      {
        name: "dup",
        createTime: "2026-01-01T00:00:00Z",
        planGenerated: {},
      } as any,
      {
        name: "dup",
        createTime: "2026-01-01T00:01:00Z",
        progressUpdated: {},
      } as any,
    ];

    const incoming = [
      {
        name: "unique",
        createTime: "2026-01-01T00:02:00Z",
        sessionFailed: { reason: "test" },
      },
    ] as any;

    const merged = mergeActivitiesByIdentity(existing, incoming);
    const summary = buildActivitySummaryHeader("RUNNING", merged);

    assert.strictEqual(merged.length, 2);
    assert.ok(summary.includes("Activities: 2"));
    assert.ok(summary.includes("Plan: 0"));
    assert.ok(summary.includes("Progress: 1"));
    assert.ok(summary.includes("Errors: 1"));
  });

  test("should merge unique activities and keep chronological order", () => {
    const existing = [
      {
        name: "activities/1",
        id: "1",
        createTime: "2026-02-28T10:00:00Z",
      },
      {
        name: "activities/2",
        id: "2",
        createTime: "2026-02-28T10:05:00Z",
      },
    ] as any;

    const incoming = [
      {
        name: "activities/1",
        id: "1",
        createTime: "2026-02-28T10:00:00Z",
      },
      {
        name: "activities/3",
        id: "3",
        createTime: "2026-02-28T10:02:00Z",
      },
    ] as any;

    const merged = mergeActivitiesByIdentity(existing, incoming);
    assert.strictEqual(merged.length, 3);
    assert.strictEqual(merged[0].name, "activities/1");
    assert.strictEqual(merged[2].name, "activities/2"); // later createTime => last
  });


  test("buildActivitySummaryHeader should handle empty activities array", () => {
    const summary = buildActivitySummaryHeader("UNKNOWN", []);
    assert.ok(summary.includes("Status: UNKNOWN"));
    assert.ok(summary.includes("Activities: 0"));
    assert.ok(summary.includes("Latest: N/A"));
  });

  test("mergeActivitiesByIdentity should handle activities without name or id", () => {
    const existing = [{ createTime: "2026-01-01T00:00:00Z" }] as any; // No name/id
    const incoming = [{ createTime: "2026-01-01T00:01:00Z" }] as any; // No name/id
    const merged = mergeActivitiesByIdentity(existing, incoming);
    assert.strictEqual(merged.length, 0); // They are ignored by the map
  });

  test("mergeActivitiesByIdentity should fallback to localeCompare for sorting when times are equal or NaN", () => {
    const existing = [
      { name: "B", id: "B", createTime: "invalid-time" },
      { name: "A", id: "A", createTime: "invalid-time" },
      { name: "C", id: "C" }, // No createTime at all
    ] as any;
    const merged = mergeActivitiesByIdentity([], existing);

    // Time should be NaN or 0, so it falls back to name comparison: A, B, C
    assert.strictEqual(merged.length, 3);
    assert.strictEqual(merged[0].name, "A");
    assert.strictEqual(merged[1].name, "B");
    assert.strictEqual(merged[2].name, "C");
  });

  test("mergeActivitiesByIdentity should fallback to localeCompare when times are exactly equal", () => {
    const existing = [
      { name: "Y", id: "Y", createTime: "2026-01-01T00:00:00Z" },
      { name: "X", id: "X", createTime: "2026-01-01T00:00:00Z" },
    ] as any;
    const merged = mergeActivitiesByIdentity([], existing);
    assert.strictEqual(merged[0].name, "X");
    assert.strictEqual(merged[1].name, "Y");
  });

  test("buildActivitySummaryHeader should handle activities with undefined createTime", () => {
    const activities = [
      { name: "X", progressUpdated: { title: "Custom Title" } },
    ] as any;
    const summary = buildActivitySummaryHeader("RUNNING", activities);
    assert.ok(summary.includes("Latest: Custom Title"));
  });

});
