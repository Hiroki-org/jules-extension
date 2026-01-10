import * as assert from 'assert';
import { sanitizeError } from '../errorUtils';

suite('Error Utils Tests (エラーユーティリティのテスト)', () => {

    test('メッセージとスタックトレースを持つErrorオブジェクトをサニタイズする必要がある', () => {
        const error = new Error('テストエラーメッセージ');
        // テストの一貫性を保つためにスタックを固定
        error.stack = 'Error: テストエラーメッセージ\n    at Test.function (test.ts:1:1)';

        const result = sanitizeError(error);

        // メッセージ部分が含まれているか確認
        assert.ok(result.includes('テストエラーメッセージ'));
        // スタック部分が保持されているか確認（スタック構造内の改行は実際の改行）
        assert.ok(result.includes('at Test.function (test.ts:1:1)'));
        // 構造の確認: メッセージ + 改行 + スタック
        const expected = 'テストエラーメッセージ\nError: テストエラーメッセージ\n    at Test.function (test.ts:1:1)';
        assert.strictEqual(result, expected);
    });

    test('スタックトレースがないErrorオブジェクトをサニタイズする必要がある', () => {
        const error = new Error('スタックなしエラー');
        error.stack = undefined;

        const result = sanitizeError(error);

        assert.strictEqual(result, 'スタックなしエラー');
    });

    test('Error以外のオブジェクトをサニタイズする必要がある', () => {
        assert.strictEqual(sanitizeError('文字列エラー'), '文字列エラー');
        assert.strictEqual(sanitizeError(123), '123');
        assert.strictEqual(sanitizeError(null), 'null');
        assert.strictEqual(sanitizeError(undefined), 'undefined');
        assert.strictEqual(sanitizeError({ foo: 'bar' }), '[object Object]');
    });

    test('エラーメッセージ内の制御文字をエスケープする必要がある', () => {
        const error = new Error('行1\n行2\tタブ付き');
        error.stack = undefined; // テスト簡略化

        const result = sanitizeError(error);

        // \n は \\n に、\t は \\t にエスケープされるべき（sanitizeForLoggingの仕様）
        assert.strictEqual(result, '行1\\n行2\\tタブ付き');
    });

    test('エラーメッセージからANSIコードを除去する必要がある', () => {
        const ansiMessage = '\x1B[31m赤色エラー\x1B[0m';
        const error = new Error(ansiMessage);
        error.stack = undefined;

        const result = sanitizeError(error);

        assert.strictEqual(result, '赤色エラー');
    });

    test('スタックトレースの各行を個別にサニタイズする必要がある', () => {
        const error = new Error('エラー');
        // スタック行に制御文字を含める（実際には稀だが堅牢性のため）
        error.stack = 'Error: msg\n    at func\t(file.ts)';

        const result = sanitizeError(error);

        // スタック行内の \t は \\t にエスケープされるべき
        // 構造: メッセージ + \n + 行1 + \n + 行2
        // メッセージ "Error" -> "Error"
        // 行1 "Error: msg" -> "Error: msg"
        // 行2 "    at func\t(file.ts)" -> "    at func\\t(file.ts)"
        const expected = 'エラー\nError: msg\n    at func\\t(file.ts)';
        assert.strictEqual(result, expected);
    });
});
