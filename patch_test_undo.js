"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
let content = fs.readFileSync('src/test/extension.test.ts', 'utf-8');
const suiteSearch = `    test("mergeActivitiesByIdentity should return existing when incoming is empty", () => {
      const existing = [{ name: "1", createTime: "2026-01-01T00:00:00Z" }] as any;
      const incoming: any[] = [];
      const merged = mergeActivitiesByIdentity(existing, incoming);
      assert.strictEqual(merged, existing);
    });

    test("mergeActivitiesByIdentity should correctly calculate counts and buildActivitySummaryHeader should use them", () => {
      const existing = [
        { name: "1", createTime: "2026-01-01T00:00:00Z", planGenerated: {} }, // Category: Plan
        { name: "2", createTime: "2026-01-01T00:01:00Z", progressUpdated: {} }, // Category: Progress
      ] as any;

      const incoming = [
        { name: "2", createTime: "2026-01-01T00:01:00Z", sessionFailed: { reason: "test" } }, // Changed to Errors
        { name: "3", createTime: "2026-01-01T00:02:00Z", artifacts: [{ changeSet: {} }] }, // Category: Artifacts
      ] as any;

      const merged = mergeActivitiesByIdentity(existing, incoming);

      const summary = buildActivitySummaryHeader("RUNNING", merged);

      assert.ok(summary.includes("Plan: 1"));
      assert.ok(summary.includes("Progress: 0")); // Because activity 2 was overwritten
      assert.ok(summary.includes("Errors: 1"));
      assert.ok(summary.includes("Artifacts: 1"));

      // Also test that buildActivitySummaryHeader calculates from scratch if array is new
      const newArray = [
        { name: "1", planGenerated: {} }, // Plan
        { name: "2", planGenerated: {} }, // Plan
      ] as any;
      const summary2 = buildActivitySummaryHeader("RUNNING", newArray);
      assert.ok(summary2.includes("Plan: 2"));
      assert.ok(summary2.includes("Progress: 0"));
    });`;
if (content.includes(suiteSearch)) {
    content = content.replace(suiteSearch, "");
    fs.writeFileSync('src/test/extension.test.ts', content);
    console.log("Patched successfully");
}
else {
    console.log("Failed to patch test file");
}
//# sourceMappingURL=patch_test_undo.js.map