import * as assert from 'assert';
import { areSourceContextsEqual } from '../sessionState';

suite('Session State Unit Tests', () => {
    test('areSourceContextsEqual should return true for identical objects', () => {
        const a = { source: 's1', githubRepoContext: { startingBranch: 'b1' } };
        const b = { source: 's1', githubRepoContext: { startingBranch: 'b1' } };
        assert.strictEqual(areSourceContextsEqual(a, b), true);
    });

    test('areSourceContextsEqual should return true for same reference', () => {
        const a = { source: 's1' };
        assert.strictEqual(areSourceContextsEqual(a, a), true);
    });

    test('areSourceContextsEqual should return false if source differs', () => {
        const a = { source: 's1' };
        const b = { source: 's2' };
        assert.strictEqual(areSourceContextsEqual(a, b), false);
    });

    test('areSourceContextsEqual should return false if one is undefined', () => {
        const a = { source: 's1' };
        assert.strictEqual(areSourceContextsEqual(a, undefined), false);
        assert.strictEqual(areSourceContextsEqual(undefined, a), false);
    });

    test('areSourceContextsEqual should return true if both undefined', () => {
        assert.strictEqual(areSourceContextsEqual(undefined, undefined), true);
    });

    test('areSourceContextsEqual should return false if githubRepoContext differs', () => {
        const a = { source: 's1', githubRepoContext: { startingBranch: 'b1' } };
        const b = { source: 's1', githubRepoContext: { startingBranch: 'b2' } };
        assert.strictEqual(areSourceContextsEqual(a, b), false);
    });

    test('areSourceContextsEqual should return false if one has githubRepoContext and other does not', () => {
        const a = { source: 's1', githubRepoContext: { startingBranch: 'b1' } };
        const b = { source: 's1' };
        assert.strictEqual(areSourceContextsEqual(a, b), false);
    });

    test('areSourceContextsEqual should return true if both lack githubRepoContext', () => {
        const a = { source: 's1' };
        const b = { source: 's1' };
        assert.strictEqual(areSourceContextsEqual(a, b), true);
    });
});
