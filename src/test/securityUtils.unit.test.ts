import * as assert from "assert";
import { stripUrlCredentials } from "../securityUtils";

suite("Security Utils Test Suite", () => {
    test("stripUrlCredentials should remove credentials from HTTPS URLs", () => {
        const url = "https://user:password@github.com/owner/repo";
        const expected = "https://github.com/owner/repo";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should remove username only from HTTPS URLs", () => {
        const url = "https://token@github.com/owner/repo";
        const expected = "https://github.com/owner/repo";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should handle URLs without credentials", () => {
        const url = "https://github.com/owner/repo";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, url);
    });

    test("stripUrlCredentials should handle HTTP URLs", () => {
        const url = "http://user:pass@example.com";
        const expected = "http://example.com/";
        // Note: new URL() might normalize "http://example.com" to "http://example.com/"
        // Let's verify what the function returns
        const result = stripUrlCredentials(url);
        assert.ok(result === "http://example.com/" || result === "http://example.com");
    });

    test("stripUrlCredentials should keep path intact", () => {
        const url = "https://user:pass@github.com/owner/repo.git";
        const expected = "https://github.com/owner/repo.git";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should return SSH URLs as is", () => {
        const url = "git@github.com:owner/repo.git";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, url);
    });

    test("stripUrlCredentials should return malformed URLs as is (fallback)", () => {
        const url = "not-a-valid-url";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, url);
    });

    test("stripUrlCredentials should handle complex passwords", () => {
        const url = "https://user:p@ss:w0rd@github.com/owner/repo";
        const expected = "https://github.com/owner/repo";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });
});
