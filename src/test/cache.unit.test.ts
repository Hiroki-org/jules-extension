import * as assert from "assert";
import { isCacheValid } from "../cache";

suite("Cache Test Suite", () => {
    test("isCacheValid should return true for valid cache within TTL", () => {
        const now = Date.now();
        const timestamp = now - 1000; // 1 second ago
        const ttlMs = 5000; // 5 seconds
        assert.strictEqual(isCacheValid(timestamp, ttlMs), true);
    });

    test("isCacheValid should return false for expired cache", () => {
        const now = Date.now();
        const timestamp = now - 10000; // 10 seconds ago
        const ttlMs = 5000; // 5 seconds
        assert.strictEqual(isCacheValid(timestamp, ttlMs), false);
    });

    test("isCacheValid should return false for cache exactly at TTL boundary", () => {
        const now = Date.now();
        const timestamp = now - 5000; // exactly 5 seconds ago
        const ttlMs = 5000; // 5 seconds
        assert.strictEqual(isCacheValid(timestamp, ttlMs), false);
    });

    test("isCacheValid should return false for cache just over TTL boundary", () => {
        const now = Date.now();
        const timestamp = now - 5001; // just over 5 seconds ago
        const ttlMs = 5000; // 5 seconds
        assert.strictEqual(isCacheValid(timestamp, ttlMs), false);
    });

    test("isCacheValid should use default TTL when not provided", () => {
        const now = Date.now();
        const timestamp = now - 1000; // 1 second ago
        // Default TTL is 5 minutes = 300000 ms
        assert.strictEqual(isCacheValid(timestamp), true);
    });
});