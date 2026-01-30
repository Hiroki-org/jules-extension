import * as assert from 'assert';
import { sanitizeError } from '../errorUtils';

suite('ErrorUtils Unit Test Suite', () => {
    test('sanitizeError handles standard Error objects', () => {
        const error = new Error('test error message');
        const result = sanitizeError(error);
        assert.ok(result.startsWith('test error message'));
    });

    test('sanitizeError escapes newlines in error message', () => {
        const error = new Error('line1\nline2');
        const result = sanitizeError(error);
        // message part should have escaped newline
        assert.ok(result.includes('line1\\nline2'));
    });

    test('sanitizeError preserves stack trace structure but sanitizes lines', () => {
        const error = new Error('error with stack');
        error.stack = 'Error: error with stack\n    at func1 (file.ts:1:1)\n    at func2 (file.ts:2:2)';

        const result = sanitizeError(error);

        // Should contain message
        assert.ok(result.includes('error with stack'));
        // Should contain stack lines separated by actual newlines (because sanitizeError joins with \n)
        // Note: sanitizeForLogging escapes newlines, but sanitizeError splits stack by \n and processes lines individually.
        // So the resulting string should have physical \n characters between stack frames.
        const lines = result.split('\n');
        // sanitizeError returns: message + '\n' + stackLine1 + '\n' + stackLine2 ...
        // So we expect 4 lines: message, then the 3 lines of stack
        assert.deepStrictEqual(lines, [
            'error with stack',
            'Error: error with stack',
            '    at func1 (file.ts:1:1)',
            '    at func2 (file.ts:2:2)'
        ]);
    });

    test('sanitizeError handles non-Error objects (string)', () => {
        const result = sanitizeError('simple string error');
        assert.strictEqual(result, 'simple string error');
    });

    test('sanitizeError handles non-Error objects (number)', () => {
        const result = sanitizeError(12345);
        assert.strictEqual(result, '12345');
    });

    test('sanitizeError handles null/undefined', () => {
        assert.strictEqual(sanitizeError(null), 'null');
        assert.strictEqual(sanitizeError(undefined), 'undefined');
    });

    test('sanitizeError truncates very long error messages', () => {
        const longMessage = 'a'.repeat(600);
        const error = new Error(longMessage);
        const result = sanitizeError(error);

        // The message part specifically should be truncated
        const firstLine = result.split('\n')[0];
        assert.ok(firstLine.endsWith('...'));
        assert.strictEqual(firstLine.length, 500);
    });
});
