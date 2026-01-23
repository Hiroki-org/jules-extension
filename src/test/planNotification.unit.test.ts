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
  test("formats title and string steps", () => {
    const result = formatFullPlan({
      title: "My Plan",
      steps: ["Step 1", "Step 2"]
    });

    assert.ok(result.includes("# My Plan"));
    assert.ok(result.includes("1. Step 1"));
    assert.ok(result.includes("2. Step 2"));
  });

  test("formats object steps with title and description", () => {
    const result = formatFullPlan({
      steps: [
        { title: "First", description: "Details 1" },
        { title: "Second" }, // Title only
        { description: "Details 3" } // Description only
      ]
    });

    // Step 1: **Title** \n   Details
    assert.ok(result.includes("1. **First**\n   Details 1"));

    // Step 2: **Title**
    assert.ok(result.includes("2. **Second**"));

    // Step 3: Details
    assert.ok(result.includes("3. Details 3"));
  });

  test("handles empty plan gracefully", () => {
    const result = formatFullPlan({});
    assert.strictEqual(result, "(No plan details available)");
  });

  test("skips empty steps", () => {
    const result = formatFullPlan({
      steps: [
        "", // empty string
        {}, // empty object
        { title: "Real Step" }
      ]
    } as any);

    assert.ok(result.includes("1. **Real Step**"));
  });
});