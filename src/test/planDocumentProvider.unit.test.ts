import * as assert from "assert";
import { formatFullPlan, type Plan, type PlanStep } from "../planUtils";
import { JulesPlanDocumentProvider } from "../planDocumentProvider";

suite("formatFullPlan", () => {
  test("formats plan with all fields", () => {
    const plan = {
      title: "Test Plan",
      steps: [
        { title: "Step 1", description: "Do first thing" },
        { title: "Step 2", description: "Do second thing" },
      ],
    };

    const result = formatFullPlan(plan);

    assert.ok(result.includes("# Plan Review"));
    assert.ok(result.includes("## 📋 Test Plan"));
    assert.ok(result.includes("1. "));
    assert.ok(result.includes("Step 1") || result.includes("Do first thing"));
    assert.ok(result.includes("2. "));
  });

  test("uses session title in header when provided", () => {
    const plan = {
      steps: [{ description: "Do something" }],
    };

    const result = formatFullPlan(plan, "My Session");

    assert.ok(result.includes("# Plan Review: My Session"));
  });

  test("uses default header when session title is missing", () => {
    const plan = {
      steps: [{ description: "Do something" }],
    };

    const result = formatFullPlan(plan);

    assert.ok(result.includes("# Plan Review"));
    assert.ok(!result.includes("# Plan Review:"));
  });

  test("formats steps with only title", () => {
    const plan = {
      title: "Plan",
      steps: [{ title: "Step with only title" }],
    };

    const result = formatFullPlan(plan);

    assert.ok(result.includes("1. Step with only title"));
  });

  test("formats steps with only description", () => {
    const plan = {
      title: "Plan",
      steps: [{ description: "Description only" }],
    };

    const result = formatFullPlan(plan);

    assert.ok(result.includes("1. Description only"));
  });

  test("handles string steps", () => {
    const plan: Plan = {
      title: "Plan",
      steps: ["String step 1", "String step 2"],
    };

    const result = formatFullPlan(plan);

    assert.ok(result.includes("1. String step 1"));
    assert.ok(result.includes("2. String step 2"));
  });

  test("skips empty steps", () => {
    const plan: Plan = {
      title: "Plan",
      steps: [
        { description: "" },
        { description: "Valid step" },
        {},
      ] as PlanStep[],
    };

    const result = formatFullPlan(plan);

    // Should only have one step numbered
    assert.ok(result.includes("1. Valid step"));
    assert.ok(!result.includes("2."));
  });

  test("handles empty steps array", () => {
    const plan = {
      title: "Empty Plan",
      steps: [],
    };

    const result = formatFullPlan(plan);

    assert.ok(result.includes("## 📋 Empty Plan"));
    assert.ok(result.includes("*No steps defined in this plan.*"));
  });

  test("handles undefined steps", () => {
    const plan: Plan = {
      title: "No Steps Plan",
    };

    const result = formatFullPlan(plan);

    assert.ok(result.includes("## 📋 No Steps Plan"));
    assert.ok(result.includes("*No steps defined in this plan.*"));
  });

  test("handles empty plan object gracefully", () => {
    const plan: Plan = {};

    const result = formatFullPlan(plan);

    assert.ok(typeof result === "string");
    assert.ok(result.includes("# Plan Review"));
  });
});

suite("JulesPlanDocumentProvider", () => {
  test("returns content for registered URI", () => {
    const provider = new JulesPlanDocumentProvider();
    const uri = provider.buildUri("test-session-123");
    const content = "# Test Plan\n\nSome content";

    provider.setContent(uri, content);

    const result = provider.provideTextDocumentContent(uri);
    assert.strictEqual(result, content);
  });

  test("returns empty string for unregistered URI", () => {
    const provider = new JulesPlanDocumentProvider();
    const uri = provider.buildUri("unknown-session");

    const result = provider.provideTextDocumentContent(uri);
    assert.strictEqual(result, "");
  });

  test("clears content for URI", () => {
    const provider = new JulesPlanDocumentProvider();
    const uri = provider.buildUri("test-session");
    const content = "# Plan";

    provider.setContent(uri, content);
    provider.clearContent(uri);

    const result = provider.provideTextDocumentContent(uri);
    assert.strictEqual(result, "");
  });

  test("buildUri creates correct URI format", () => {
    const provider = new JulesPlanDocumentProvider();
    const uri = provider.buildUri("session-abc-123");

    // Use toString() for assertion as mock Uri.parse may not set all properties
    const uriString = uri.toString();
    assert.ok(uriString.includes("jules-plan://"));
    assert.ok(uriString.includes("session-abc-123"));
    assert.ok(uriString.endsWith(".md"));
  });

  test("handles multiple sessions independently", () => {
    const provider = new JulesPlanDocumentProvider();
    const uri1 = provider.buildUri("session-1");
    const uri2 = provider.buildUri("session-2");

    provider.setContent(uri1, "Content 1");
    provider.setContent(uri2, "Content 2");

    assert.strictEqual(provider.provideTextDocumentContent(uri1), "Content 1");
    assert.strictEqual(provider.provideTextDocumentContent(uri2), "Content 2");

    provider.clearContent(uri1);
    assert.strictEqual(provider.provideTextDocumentContent(uri1), "");
    assert.strictEqual(provider.provideTextDocumentContent(uri2), "Content 2");
  });
});
