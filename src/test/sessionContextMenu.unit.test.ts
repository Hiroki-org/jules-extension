import * as assert from 'assert';
import { getBranchNameForSession, parsePullRequestUrl, getPullRequestUrlForSession, _findTargetRemote } from '../sessionContextMenu';
import type { Session } from '../types';

suite('sessionContextMenu Test Suite', () => {
    suite('_findTargetRemote', () => {
        test('should return exactly matching fetchUrl and remote', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/origin/repo.git' },
                { remote: 'other', fetchUrl: 'https://github.com/fork/repo.git' },
                { remote: 'fork', fetchUrl: 'https://github.com/fork/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'fork');
        });


        test('should immediately return if perfect match without .git suffix is found', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/origin/repo' },
                { remote: 'fork', fetchUrl: 'https://github.com/fork/repo' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'fork');
        });

        test('should not fallback if urlMatch is found and origin is missing', () => {
            const remotes = [
                { remote: 'other', fetchUrl: 'https://github.com/fork/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'other');
        });

        test('should fallback to origin missing URL check but correctly returning origin with matching parts', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/fork/repo-different.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/repo.git', 'fork', 'repo-different');
            assert.strictEqual(result?.remote, 'origin');
        });
        test('should fallback to origin missing URL check but correctly returning origin with missing fetchUrl parts', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/fork/repo-different.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/repo.git', 'fork', 'repo-different');
            assert.strictEqual(result?.remote, 'origin');
        });
        test('should fallback to origin when urlMatch is missing but origin matches fetchUrl via includes', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/fork/repo-different.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/other.git', 'fork', 'repo-different');
            assert.strictEqual(result?.remote, 'origin');
        });



        test('should handle completely missing url properties', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: '' as unknown as string }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/repo.git', 'fork', 'repo-different');
            assert.strictEqual(result, undefined);
        });
        test('should skip and fallback to origin if urlMatch is empty', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/fork/repo.git' },
                { remote: 'other', fetchUrl: '' as unknown as string }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/other.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'origin');
        });
        test('should fallback to origin with undefined fetchUrl', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: undefined as unknown as string }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/other.git', 'fork', 'repo');
            assert.strictEqual(result, undefined);
        });
        test('should fallback to origin if fetchUrl is undefined and urlMatch is fallback', () => {
            const remotes = [
                { remote: 'other', fetchUrl: 'https://github.com/fork/repo.git' },
                { remote: 'origin', fetchUrl: undefined as unknown as string }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'other');
        });

        test('should fallback to origin with only remote owner match', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/different/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/different2/different2.git', 'different', 'different');
            assert.strictEqual(result, undefined);
        });

        test('should completely fail to fallback if origin fetchUrl does not include owner repo', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/different/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/other/other.git', 'other', 'other');
            assert.strictEqual(result, undefined);
        });
        test('should fallback to origin if fetchUrl is undefined, missing urlMatch, but missing owner string in fetchUrl fallback array', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: undefined as unknown as string }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result, undefined);
        });

        test('should ignore undefined origin in fallback when no urlMatch matches', () => {
            const remotes = [
                { remote: 'fork', fetchUrl: 'https://github.com/fork/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/repo.git', 'unmatched', 'repo');
            assert.strictEqual(result, undefined);
        });
        test('should fallback to origin if fetchUrl is missing and cleanUrl fallback matching url fails, but owner fallback works', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/fork/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/repo', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'origin');
        });










        test('should fallback to origin if it matches the head repo fully', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/fork/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/unmatched/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'origin');
        });


        test('should use only origin matched by url ignoring remote owner match when full remote is matched via substring', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/different/different.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo', 'different', 'different');
            assert.strictEqual(result?.remote, 'origin');
        });
        test('should fallback to urlMatch if no origin and target match is found', () => {
            const remotes = [
                { remote: 'something_else', fetchUrl: 'https://github.com/fork/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'something_else');
        });


        test('should use only origin matched by url ignoring remote owner match when full remote is matched', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/fork/repo' },
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo', 'different-owner', 'repo');
            assert.strictEqual(result?.remote, 'origin');
        });

        test('should immediately return if perfect match with .git suffix is found', () => {
            const remotes = [
                { remote: 'fork', fetchUrl: 'https://github.com/fork/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'fork');
        });



        test('should return fetchUrl match when exact match is missing', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/origin/repo.git' },
                { remote: 'other', fetchUrl: 'https://github.com/fork/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'other');
        });

        test('should fallback to origin if fetchUrl contains owner/repo', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/fork/repo.git' },
                { remote: 'other', fetchUrl: 'https://github.com/other/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo-different.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'origin');
        });

        test('should return undefined when no matches found', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/origin/repo.git' },
                { remote: 'other', fetchUrl: 'https://github.com/other/repo.git' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result, undefined);
        });

        test('should handle .git suffix matching correctly', () => {
            const remotes = [
                { remote: 'origin', fetchUrl: 'https://github.com/origin/repo' },
                { remote: 'fork', fetchUrl: 'https://github.com/fork/repo' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo.git', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'fork');
        });
        test('should skip and correctly handle cleanHeadCloneUrl fallback logic when headCloneUrl does not contain .git', () => {
            const remotes = [
                { remote: 'fork', fetchUrl: 'https://github.com/fork/repo' }
            ];
            const result = _findTargetRemote(remotes, 'https://github.com/fork/repo', 'fork', 'repo');
            assert.strictEqual(result?.remote, 'fork');
        });



    });

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

    suite('parsePullRequestUrl', () => {
        test('should parse valid GitHub PR URL', () => {
            const result = parsePullRequestUrl('https://github.com/owner/repo/pull/123');
            assert.deepStrictEqual(result, {
                owner: 'owner',
                repo: 'repo',
                prNumber: 123
            });
        });

        test('should parse PR URL with trailing segments', () => {
            const result = parsePullRequestUrl('https://github.com/owner/repo/pull/456/files');
            assert.deepStrictEqual(result, {
                owner: 'owner',
                repo: 'repo',
                prNumber: 456
            });
        });

        test('should return null for non-GitHub URL', () => {
            const result = parsePullRequestUrl('https://gitlab.com/owner/repo/pull/123');
            assert.strictEqual(result, null);
        });

        test('should return null for invalid URL format', () => {
            const result = parsePullRequestUrl('not-a-url');
            assert.strictEqual(result, null);
        });

        test('should return null for GitHub URL without pull path', () => {
            const result = parsePullRequestUrl('https://github.com/owner/repo');
            assert.strictEqual(result, null);
        });

        test('should return null for GitHub issue URL (not PR)', () => {
            const result = parsePullRequestUrl('https://github.com/owner/repo/issues/123');
            assert.strictEqual(result, null);
        });

        test('should return null for invalid PR number', () => {
            const result = parsePullRequestUrl('https://github.com/owner/repo/pull/abc');
            assert.strictEqual(result, null);
        });

        test('should return null for zero PR number', () => {
            const result = parsePullRequestUrl('https://github.com/owner/repo/pull/0');
            assert.strictEqual(result, null);
        });

        test('should return null for negative PR number', () => {
            const result = parsePullRequestUrl('https://github.com/owner/repo/pull/-1');
            assert.strictEqual(result, null);
        });
    });

    suite('getPullRequestUrlForSession (Session fallback scenarios)', () => {
        test('should return null when session has no outputs', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED'
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return null when outputs array is empty', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                outputs: []
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return null when outputs have no pullRequest', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                outputs: [
                    {} // SessionOutput without pullRequest
                ]
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return canonical URL when pullRequest has valid URL', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                outputs: [
                    {
                        pullRequest: {
                            url: 'https://github.com/owner/repo/pull/789'
                        }
                    }
                ]
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, 'https://github.com/owner/repo/pull/789');
        });

        test('should return null for pullRequest with invalid URL', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                outputs: [
                    {
                        pullRequest: {
                            url: 'invalid-url'
                        }
                    }
                ]
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return null for pullRequest with non-https URL', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                outputs: [
                    {
                        pullRequest: {
                            url: 'http://github.com/owner/repo/pull/123'
                        }
                    }
                ]
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should return null for pullRequest with non-GitHub URL', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                outputs: [
                    {
                        pullRequest: {
                            url: 'https://bitbucket.org/owner/repo/pull/123'
                        }
                    }
                ]
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, null);
        });

        test('should strip query string from PR URL', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                outputs: [
                    {
                        pullRequest: {
                            url: 'https://github.com/owner/repo/pull/123?diff=unified'
                        }
                    }
                ]
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, 'https://github.com/owner/repo/pull/123');
        });

        test('should find pullRequest in outputs array with multiple items', () => {
            const session: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                outputs: [
                    {}, // SessionOutput without pullRequest
                    { pullRequest: { url: 'https://github.com/owner/repo/pull/999' } },
                    {} // Another empty SessionOutput
                ]
            };
            const result = getPullRequestUrlForSession(session as Session);
            assert.strictEqual(result, 'https://github.com/owner/repo/pull/999');
        });
    });

    suite('Fallback Behavior Integration Tests', () => {
        test('getBranchNameForSession provides fallback when no PR URL available', () => {
            // This simulates the scenario where GitHub API fails but session data has branch info
            const sessionWithBranchOnly: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                sourceContext: {
                    source: 'github',
                    githubRepoContext: {
                        startingBranch: 'feature/fallback-branch'
                    }
                }
                // Note: no outputs, so getPullRequestUrlForSession returns null
            };

            // GitHub API path would fail (no PR URL)
            const prUrl = getPullRequestUrlForSession(sessionWithBranchOnly as Session);
            assert.strictEqual(prUrl, null, 'PR URL should be null');

            // Fallback path works (session has branch info)
            const branchName = getBranchNameForSession(sessionWithBranchOnly as Session);
            assert.strictEqual(branchName, 'feature/fallback-branch', 'Should fallback to branch from session data');
        });

        test('getBranchNameForSession returns null when fallback is also unavailable', () => {
            // This simulates complete fallback failure
            const sessionWithNothing: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED'
                // No outputs, no sourceContext
            };

            const prUrl = getPullRequestUrlForSession(sessionWithNothing as Session);
            assert.strictEqual(prUrl, null);

            const branchName = getBranchNameForSession(sessionWithNothing as Session);
            assert.strictEqual(branchName, null);
        });

        test('session with both PR and branch info should allow either path', () => {
            // This represents best-case scenario with full session data
            const fullSession: Partial<Session> = {
                name: 'test-session',
                title: 'Test Session',
                state: 'COMPLETED',
                rawState: 'COMPLETED',
                sourceContext: {
                    source: 'github',
                    githubRepoContext: {
                        startingBranch: 'feature/my-branch'
                    }
                },
                outputs: [
                    {
                        pullRequest: {
                            url: 'https://github.com/owner/repo/pull/123'
                        }
                    }
                ]
            };

            // Both paths work
            const prUrl = getPullRequestUrlForSession(fullSession as Session);
            assert.strictEqual(prUrl, 'https://github.com/owner/repo/pull/123');

            const branchName = getBranchNameForSession(fullSession as Session);
            assert.strictEqual(branchName, 'feature/my-branch');

            // parsePullRequestUrl works on the PR URL
            const parsed = parsePullRequestUrl(prUrl!);
            assert.deepStrictEqual(parsed, {
                owner: 'owner',
                repo: 'repo',
                prNumber: 123
            });
        });
    });
});
