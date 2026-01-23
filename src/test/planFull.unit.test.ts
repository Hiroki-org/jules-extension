import * as assert from "assert";
import { formatFullPlan } from "../planUtils";

suite("Full Plan Formatting", () => {
  test("formats simple plan with title and steps", () => {
    const result = formatFullPlan({
      title: "My Plan",
      steps: [{ description: "Step 1" }, { description: "Step 2" }]
    });

    assert.ok(result.includes("# My Plan"));
    assert.ok(result.includes("1. Step 1"));
    assert.ok(result.includes("2. Step 2"));
  });

  test("handles plan without title", () => {
    const result = formatFullPlan({
      steps: [{ description: "Step 1" }]
    });

    assert.ok(!result.includes("#"));
    assert.ok(result.includes("1. Step 1"));
  });

  test("handles empty steps list", () => {
    const result = formatFullPlan({
      title: "Empty Plan",
      steps: []
    });

    assert.ok(result.includes("# Empty Plan"));
    assert.ok(result.includes("_No steps provided in the plan._"));
  });

  test("handles mixed step types (string/object)", () => {
     const result = formatFullPlan({
      steps: ["Step 1 string", { title: "Step 2 title" }]
    });

    assert.ok(result.includes("1. Step 1 string"));
    assert.ok(result.includes("2. Step 2 title"));
  });
});
