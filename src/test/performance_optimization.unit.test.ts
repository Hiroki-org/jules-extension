import * as assert from "assert";
import { areSessionListsEqual } from "../extension";
import { Session } from "../types";

suite("Performance Optimization Unit Tests", () => {
  test("areSessionListsEqual should correctly compare lists with multiple sessions using optimized loop", () => {
    const s1: Session = { name: "sessions/s1", title: "S1", state: "RUNNING" } as any;
    const s2: Session = { name: "sessions/s2", title: "S2", state: "RUNNING" } as any;
    const s3: Session = { name: "sessions/s3", title: "S3", state: "RUNNING" } as any;

    // Same elements, different order (triggering slow path with Map)
    assert.strictEqual(areSessionListsEqual([s1, s2, s3], [s3, s1, s2]), true);
    
    // Different elements
    assert.strictEqual(areSessionListsEqual([s1, s2], [s1, s3]), false);
    
    // Different lengths
    assert.strictEqual(areSessionListsEqual([s1, s2], [s1, s2, s3]), false);
  });
});
