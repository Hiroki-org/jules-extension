import * as assert from "assert";
import { stripUrlCredentials, sanitizeForLogging, isValidSessionId } from "../securityUtils";

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

    test("stripUrlCredentials should strip credentials from malformed URLs (fallback)", () => {
        // This URL causes new URL() to throw because of invalid port format
        const url = "https://user:pass@github.com:invalidport/repo";
        const expected = "https://github.com:invalidport/repo";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should escape newlines and tabs", () => {
        const input = "Line 1\nLine 2\tTabbed\rReturn";
        const expected = "Line 1\\nLine 2\\tTabbed\\rReturn";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should truncate long strings", () => {
        const input = "a".repeat(20);
        assert.strictEqual(sanitizeForLogging(input, 10), "aaaaaaa...");
        assert.strictEqual(sanitizeForLogging(input, 3), "aaa");
    });

    test("sanitizeForLogging should handle null/undefined", () => {
        assert.strictEqual(sanitizeForLogging(null), "null");
        assert.strictEqual(sanitizeForLogging(undefined), "undefined");
    });

    test("sanitizeForLogging should handle numbers", () => {
        assert.strictEqual(sanitizeForLogging(123), "123");
    });

    test("sanitizeForLogging should remove non-printable control characters", () => {
        const input = "Text\x00\x1FWith\x7FDeleteEnd";
        const expected = "TextWithDeleteEnd";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should strip ANSI escape codes", () => {
        const input = "\u001b[31mRed Error\u001b[0m";
        const expected = "Red Error";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    // Additional comprehensive tests for ANSI escape code stripping

    test("sanitizeForLogging should strip multiple ANSI codes in sequence", () => {
        const input = "\u001b[31m\u001b[1mBold Red\u001b[0m\u001b[32mGreen\u001b[0m";
        const expected = "Bold RedGreen";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should strip ANSI codes with various parameters", () => {
        const input = "\u001b[38;5;196mColor256\u001b[0m";
        const expected = "Color256";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should strip ANSI cursor movement codes", () => {
        const input = "\u001b[2J\u001b[H\u001b[KClear Screen";
        const expected = "Clear Screen";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should strip complex RGB ANSI codes", () => {
        const input = "\u001b[38;2;255;100;0mRGB Color\u001b[0m";
        const expected = "RGB Color";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should handle ANSI codes at string boundaries", () => {
        const input = "\u001b[31mStart\u001b[0m Middle \u001b[32mEnd\u001b[0m";
        const expected = "Start Middle End";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should strip ANSI codes and truncate correctly", () => {
        const input = "\u001b[31m" + "a".repeat(100) + "\u001b[0m";
        const result = sanitizeForLogging(input, 20);
        assert.strictEqual(result, "aaaaaaaaaaaaaaaaa...");
        assert.strictEqual(result.length, 20);
    });

    test("sanitizeForLogging should handle ANSI codes with control characters", () => {
        const input = "\u001b[31mError:\nLine1\u001b[0m\nLine2";
        const expected = "Error:\\nLine1\\nLine2";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should strip ANSI and remove non-printable chars together", () => {
        const input = "\u001b[31mText\x00\u001b[0mWith\x1FNull";
        const expected = "TextWithNull";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should handle empty ANSI sequences", () => {
        const input = "\u001b[mNormal Text";
        const expected = "Normal Text";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should handle OSC (Operating System Command) sequences", () => {
        const input = "\u001b]0;Window Title\u0007Text Content";
        const expected = "Text Content";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should handle malformed ANSI-like sequences", () => {
        const input = "\u001b[Invalid ANSI Code";
        // Should still strip the escape sequence
        const result = sanitizeForLogging(input);
        assert.ok(!result.includes("\u001b"));
    });

    // Edge cases for null/undefined handling with strict equality

    test("sanitizeForLogging should use strict equality for null check", () => {
        // This tests the change from == to ===
        const result1 = sanitizeForLogging(null);
        const result2 = sanitizeForLogging(undefined);
        assert.strictEqual(result1, "null");
        assert.strictEqual(result2, "undefined");
    });

    test("sanitizeForLogging should not treat 0 as null or undefined", () => {
        const result = sanitizeForLogging(0);
        assert.strictEqual(result, "0");
    });

    test("sanitizeForLogging should not treat empty string as null or undefined", () => {
        const result = sanitizeForLogging("");
        assert.strictEqual(result, "");
    });

    test("sanitizeForLogging should not treat false as null or undefined", () => {
        const result = sanitizeForLogging(false);
        assert.strictEqual(result, "false");
    });

    // Additional truncation edge cases

    test("sanitizeForLogging should handle maxLength of 0", () => {
        const input = "test";
        const result = sanitizeForLogging(input, 0);
        assert.strictEqual(result, "");
    });

    test("sanitizeForLogging should handle maxLength of 1", () => {
        const input = "test";
        const result = sanitizeForLogging(input, 1);
        assert.strictEqual(result, "t");
    });

    test("sanitizeForLogging should handle maxLength of 2", () => {
        const input = "test";
        const result = sanitizeForLogging(input, 2);
        assert.strictEqual(result, "te");
    });

    test("sanitizeForLogging should handle exact length match", () => {
        const input = "exactly10!";
        const result = sanitizeForLogging(input, 10);
        assert.strictEqual(result, "exactly10!");
    });

    test("sanitizeForLogging should handle string one char longer than max", () => {
        const input = "exactly11!!";
        const result = sanitizeForLogging(input, 10);
        assert.strictEqual(result, "exactly...");
    });

    // Complex real-world scenarios

    test("sanitizeForLogging should handle GitHub API error response with ANSI", () => {
        const input = "\u001b[31mHTTP 422:\n{\n  \"message\": \"Validation Failed\",\n  \"errors\": [\u001b[0m";
        const result = sanitizeForLogging(input);
        assert.ok(!result.includes("\u001b"));
        assert.ok(result.includes("\\n"));
        assert.strictEqual(result.includes("\n"), false);
    });

    test("sanitizeForLogging should handle stack traces with ANSI codes", () => {
        const input = "\u001b[31mError: Failed\u001b[0m\n    at Object.<anonymous> (/path/to/file.js:10:15)";
        const result = sanitizeForLogging(input);
        assert.ok(!result.includes("\u001b"));
        assert.ok(result.includes("\\n"));
    });

    test("sanitizeForLogging should handle JSON with ANSI formatting", () => {
        const input = "{\u001b[32m\"status\"\u001b[0m: \u001b[33m\"error\"\u001b[0m}";
        const expected = "{\"status\": \"error\"}";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    // Type coercion tests

    test("sanitizeForLogging should handle boolean values", () => {
        assert.strictEqual(sanitizeForLogging(true), "true");
        assert.strictEqual(sanitizeForLogging(false), "false");
    });

    test("sanitizeForLogging should handle object values", () => {
        const obj = { key: "value" };
        const result = sanitizeForLogging(obj);
        assert.strictEqual(result, "[object Object]");
    });

    test("sanitizeForLogging should handle array values", () => {
        const arr = [1, 2, 3];
        const result = sanitizeForLogging(arr);
        assert.strictEqual(result, "1,2,3");
    });

    test("sanitizeForLogging should handle NaN", () => {
        const result = sanitizeForLogging(NaN);
        assert.strictEqual(result, "NaN");
    });

    test("sanitizeForLogging should handle Infinity", () => {
        assert.strictEqual(sanitizeForLogging(Infinity), "Infinity");
        assert.strictEqual(sanitizeForLogging(-Infinity), "-Infinity");
    });

    // Combined ANSI stripping and truncation

    test("sanitizeForLogging should strip ANSI before calculating length for truncation", () => {
        // 10 ANSI chars + 30 visible chars = should show 27 visible + ...
        const ansiPrefix = "\u001b[31m";
        const ansiSuffix = "\u001b[0m";
        const visibleText = "a".repeat(30);
        const input = ansiPrefix + visibleText + ansiSuffix;
        const result = sanitizeForLogging(input, 30);
        // After stripping ANSI, we have 30 chars which equals maxLength
        assert.strictEqual(result, visibleText);
    });

    test("sanitizeForLogging should handle multiple ANSI codes before truncating", () => {
        const input = "\u001b[31m\u001b[1m\u001b[4m" + "b".repeat(100) + "\u001b[0m";
        const result = sanitizeForLogging(input, 20);
        assert.strictEqual(result, "bbbbbbbbbbbbbbbbb...");
    });

    // Performance and edge cases

    test("sanitizeForLogging should handle very long strings efficiently", () => {
        const input = "c".repeat(10000);
        const result = sanitizeForLogging(input, 100);
        assert.strictEqual(result.length, 100);
        assert.strictEqual(result, "c".repeat(97) + "...");
    });

    test("sanitizeForLogging should handle strings with only ANSI codes", () => {
        const input = "\u001b[31m\u001b[0m\u001b[32m\u001b[0m";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, "");
    });

    test("sanitizeForLogging should handle alternating ANSI and text", () => {
        const input = "\u001b[31mA\u001b[0m\u001b[32mB\u001b[0m\u001b[33mC\u001b[0m";
        const expected = "ABC";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    // Control character combinations

    test("sanitizeForLogging should handle mix of \\n, \\r, \\t", () => {
        const input = "Line1\nLine2\rLine3\tTab";
        const expected = "Line1\\nLine2\\rLine3\\tTab";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should handle \\r\\n (Windows line ending)", () => {
        const input = "Line1\r\nLine2";
        const expected = "Line1\\r\\nLine2";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should preserve spaces while removing control chars", () => {
        const input = "Text  \x00  With  \x1F  Spaces";
        const expected = "Text    With    Spaces";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    // Unicode and special characters

    test("sanitizeForLogging should preserve Unicode characters", () => {
        const input = "Hello 世界 🌍 Émoji";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, input);
    });

    test("sanitizeForLogging should handle Unicode with ANSI codes", () => {
        const input = "\u001b[31m世界\u001b[0m";
        const expected = "世界";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    test("sanitizeForLogging should handle emoji with ANSI codes", () => {
        const input = "\u001b[32m🚀\u001b[0m Success!";
        const expected = "🚀 Success!";
        const result = sanitizeForLogging(input);
        assert.strictEqual(result, expected);
    });

    // Additional stripUrlCredentials edge cases

    test("stripUrlCredentials should handle empty string", () => {
        const result = stripUrlCredentials("");
        assert.strictEqual(result, "");
    });

    test("stripUrlCredentials should handle URL with port", () => {
        const url = "https://user:pass@example.com:8080/path";
        const expected = "https://example.com:8080/path";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should handle URL with query parameters", () => {
        const url = "https://user:pass@example.com/path?query=value";
        const expected = "https://example.com/path?query=value";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should handle URL with fragment", () => {
        const url = "https://user:pass@example.com/path#fragment";
        const expected = "https://example.com/path#fragment";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should handle URL with special chars in password", () => {
        const url = "https://user:p%40ss%3Aw0rd@github.com/repo";
        const expected = "https://github.com/repo";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should handle URL with @ in path", () => {
        const url = "https://github.com/user@domain/repo";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, url);
    });

    test("stripUrlCredentials should handle ftp URLs as-is", () => {
        const url = "ftp://user:pass@ftp.example.com/file";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, url);
    });

    test("stripUrlCredentials should handle git protocol URLs", () => {
        const url = "git://github.com/user/repo.git";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, url);
    });

    test("stripUrlCredentials should handle file protocol URLs", () => {
        const url = "file:///path/to/file";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, url);
    });

    test("stripUrlCredentials should handle URL with IPv4 address", () => {
        const url = "https://user:pass@192.168.1.1/path";
        const expected = "https://192.168.1.1/path";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should handle URL with IPv6 address", () => {
        const url = "https://user:pass@[2001:db8::1]/path";
        const expected = "https://[2001:db8::1]/path";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    test("stripUrlCredentials should handle multiple @ symbols in credentials", () => {
        const url = "https://user@email.com:pass@github.com/repo";
        const expected = "https://github.com/repo";
        const result = stripUrlCredentials(url);
        assert.strictEqual(result, expected);
    });

    suite("isValidSessionId", () => {
        test("should return true for valid session IDs", () => {
            assert.strictEqual(isValidSessionId("sessions/123"), true);
            assert.strictEqual(isValidSessionId("projects/p/locations/l/sessions/s"), true);
            assert.strictEqual(isValidSessionId("abc-def_123"), true);
        });

        test("should return false for path traversal", () => {
            assert.strictEqual(isValidSessionId("../evil"), false);
            assert.strictEqual(isValidSessionId("sessions/../../passwd"), false);
            assert.strictEqual(isValidSessionId(".."), false);
        });

        test("should return false for invalid characters", () => {
            assert.strictEqual(isValidSessionId("sessions/123?query=1"), false);
            assert.strictEqual(isValidSessionId("sessions/123#frag"), false);
            assert.strictEqual(isValidSessionId("sessions/123%00"), false);
            assert.strictEqual(isValidSessionId("sessions/123<script>"), false);
            assert.strictEqual(isValidSessionId("sessions/123 space"), false);
        });

        test("should return false for empty or non-string inputs", () => {
            assert.strictEqual(isValidSessionId(""), false);
            assert.strictEqual(isValidSessionId(null as any), false);
            assert.strictEqual(isValidSessionId(undefined as any), false);
        });
    });
});
