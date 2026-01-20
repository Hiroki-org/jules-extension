import * as assert from "assert";
import { formatPlanForNotification } from "../planUtils";

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
});
