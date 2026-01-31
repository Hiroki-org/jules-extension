import * as assert from 'assert';
import { getBranchNameForSession } from '../sessionContextMenu';
import type { Session } from '../types';

suite('sessionContextMenu Test Suite', () => {
    suite('getBranchNameForSession', () => {
        test('should return branch name when sourceContext.githubRepoContext.startingBranch is present', () => {
            const session: Partial<Session> = {
                name: 'test-session-1',
                title: 'Test Session 1',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                sourceContext: {
                    source: 'github',
                    githubRepoContext: {
                        startingBranch: 'feature/my-branch'
                    }
                }
            };
            const result = getBranchNameForSession(session as Session);
            assert.strictEqual(result, 'feature/my-branch');
        });

        test('should trim whitespace from branch name', () => {
            const session: Partial<Session> = {
                name: 'test-session-2',
                title: 'Test Session 2',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                sourceContext: {
                    source: 'github',
                    githubRepoContext: {
                        startingBranch: '  feature/whitespace  '
                    }
                }
            };
            const result = getBranchNameForSession(session as Session);
            assert.strictEqual(result, 'feature/whitespace');
        });

        test('should return null when sourceContext is undefined', () => {
            const session: Partial<Session> = {
                name: 'test-session-3',
                title: 'Test Session 3',
                state: 'COMPLETED',
                rawState: 'COMPLETED'
            };
            const result = getBranchNameForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return null when githubRepoContext is undefined', () => {
            const session: Partial<Session> = {
                name: 'test-session-4',
                title: 'Test Session 4',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                sourceContext: {
                    source: 'github'
                }
            };
            const result = getBranchNameForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return null when startingBranch is undefined', () => {
            const session: Partial<Session> = {
                name: 'test-session-5',
                title: 'Test Session 5',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                sourceContext: {
                    source: 'github',
                    githubRepoContext: {}
                }
            };
            const result = getBranchNameForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return null when startingBranch is empty string', () => {
            const session: Partial<Session> = {
                name: 'test-session-6',
                title: 'Test Session 6',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                sourceContext: {
                    source: 'github',
                    githubRepoContext: {
                        startingBranch: ''
                    }
                }
            };
            const result = getBranchNameForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return null when startingBranch is only whitespace', () => {
            const session: Partial<Session> = {
                name: 'test-session-7',
                title: 'Test Session 7',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                sourceContext: {
                    source: 'github',
                    githubRepoContext: {
                        startingBranch: '   '
                    }
                }
            };
            const result = getBranchNameForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should handle various branch name formats', () => {
            const testCases = [
                { input: 'main', expected: 'main' },
                { input: 'feature/new-feature', expected: 'feature/new-feature' },
                { input: 'bugfix/issue-123', expected: 'bugfix/issue-123' },
                { input: 'refs/heads/develop', expected: 'refs/heads/develop' },
                { input: 'feature/with-dashes-and_underscores', expected: 'feature/with-dashes-and_underscores' }
            ];

            for (const { input, expected } of testCases) {
                const session: Partial<Session> = {
                    name: `test-session-${input}`,
                    title: `Test Session ${input}`,
                    state: 'COMPLETED',
                    rawState: 'COMPLETED',
                    sourceContext: {
                        source: 'github',
                        githubRepoContext: {
                            startingBranch: input
                        }
                    }
                };
                const result = getBranchNameForSession(session as Session);
                assert.strictEqual(result, expected, `Failed for input: ${input}`);
            }
        });
    });
});
