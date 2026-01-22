import * as assert from "assert";
import { formatPlanForNotification, formatFullPlan } from "../planUtils";

suite("Plan Notification Formatting", () => {
  test("uses title as fallback when description is missing", () => {
    const result = formatPlanForNotification(
      {
        steps: [{ title: "Do X" }],
      } as any,
      5,
      80
    );

    assert.ok(result.includes("1. Do X"));
  });

  test("skips empty description steps and compacts numbering", () => {
    const result = formatPlanForNotification(
      {
        steps: [{ description: "" }, { description: "Do Y" }],
      } as any,
      5,
      80
    );

    assert.ok(result.includes("1. Do Y"));
    assert.ok(!/1\.\s*(\n|$)/.test(result));
  });

  test("ignores empty object steps", () => {
    const result = formatPlanForNotification(
      {
        steps: [{} as any, { description: "Do Z" }],
      } as any,
      5,
      80
    );

    assert.ok(result.includes("1. Do Z"));
    assert.ok(!/1\.\s*(\n|$)/.test(result));
  });

  test("handles string steps", () => {
    const result = formatPlanForNotification(
      {
        steps: ["Do A", "Do B"] as any,
      } as any,
      5,
      80
    );

    assert.ok(result.includes("1. Do A"));
    assert.ok(result.includes("2. Do B"));
  });

  test("handles empty steps safely", () => {
    const result = formatPlanForNotification(
      {
        steps: [],
      } as any,
      5,
      80
    );

    assert.strictEqual(result, "");
  });

  test("clamps negative maxSteps to 0 and excludes steps", () => {
    const result = formatPlanForNotification(
      {
        steps: [{ description: "Do X" }, { description: "Do Y" }],
      } as any,
      -5,
      80
    );

    assert.strictEqual(result, "");
  });

  test("clamps zero maxSteps and excludes steps", () => {
    const result = formatPlanForNotification(
      {
        steps: [{ description: "Do X" }],
      } as any,
      0,
      80
    );

    assert.strictEqual(result, "");
  });

  test("clamps maxStepLength below 4 to ensure ... can fit", () => {
    // maxStepLength=3 should be clamped to 4
    // A step like "Do X" is 4 chars, which matches clamped length, so no truncation
    const result = formatPlanForNotification(
      {
        steps: [{ description: "Do X" }],
      } as any,
      5,
      3
    );

    assert.ok(result.includes("1. Do X"));
    assert.ok(!result.includes("..."));
  });

  test("clamps maxStepLength=1 and handles truncation safely", () => {
    // maxStepLength=1 should be clamped to 4, allowing "..." to fit
    const result = formatPlanForNotification(
      {
        steps: [{ description: "Very long description here" }],
      } as any,
      5,
      1
    );

    // After clamp to 4, "Very long description here" should be truncated to "..." (0 chars + "...")
    assert.ok(result.includes("1."));
    // Should not crash and should have either "..." or truncated content
    assert.ok(result.length > 0);
  });

  test("handles non-array steps gracefully", () => {
    const result = formatPlanForNotification(
      {
        steps: "not an array" as any,
      } as any,
      5,
      80
    );

    assert.strictEqual(result, "");
  });

  test("skips empty title and only shows steps", () => {
    const result = formatPlanForNotification(
      {
        title: "   ",
        steps: [{ description: "Do X" }],
      } as any,
      5,
      80
    );

    assert.ok(result.includes("1. Do X"));
    assert.ok(!result.includes("📋"));
  });

  test("handles floats in maxSteps and maxStepLength by flooring", () => {
    const result = formatPlanForNotification(
      {
        steps: [{ description: "Do X" }, { description: "Do Y" }],
      } as any,
      1.9,
      80.5
    );

    // maxSteps floors to 1, so only first step shown
    assert.ok(result.includes("1. Do X"));
    assert.ok(!result.includes("2. Do Y"));
  });
});

suite("Plan Full Formatting", () => {
    test("formats full plan with title and steps", () => {
        const result = formatFullPlan({
            title: "Test Plan",
            steps: [
                { title: "Step 1", description: "Desc 1" },
                "Step 2 string"
            ]
        });

        assert.ok(result.includes("# Test Plan"));
        assert.ok(result.includes("## Step 1"));
        assert.ok(result.includes("**Step 1**"));
        assert.ok(result.includes("Desc 1"));
        assert.ok(result.includes("## Step 2"));
        assert.ok(result.includes("Step 2 string"));
    });

    test("formats full plan with empty steps", () => {
        const result = formatFullPlan({
            title: "Empty Plan",
            steps: []
        });

        assert.ok(result.includes("# Empty Plan"));
        assert.ok(result.includes("No plan steps available."));
    });

    test("formats full plan with only steps", () => {
        const result = formatFullPlan({
            steps: ["Only step"]
        });

        // Should not have H1 title
        assert.ok(!result.startsWith("# "));
        assert.ok(result.includes("## Step 1"));
        assert.ok(result.includes("Only step"));
    });

    test("skips empty and whitespace-only steps in full plan", () => {
        const result = formatFullPlan({
            title: "Sparse Plan",
            steps: [
                "  ",  // whitespace only
                { title: "", description: "" }, // empty object
                "Real Step"
            ]
        });

        assert.ok(result.includes("# Sparse Plan"));
        // "Real Step" should be Step 1
        assert.ok(result.includes("## Step 1"));
        assert.ok(result.includes("Real Step"));
        // Should not have Step 2
        assert.ok(!result.includes("## Step 2"));
    });

    test("handles plan where all steps are empty", () => {
        const result = formatFullPlan({
            title: "Ghost Plan",
            steps: [" ", {} as any, { description: "  " }]
        });

        assert.ok(result.includes("No plan steps available."));
        assert.ok(!result.includes("## Step 1"));
    });
});
