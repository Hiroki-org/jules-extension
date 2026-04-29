import * as assert from 'assert';
import * as githubUtils from '../githubUtils';
import * as sinon from 'sinon';

suite('githubUtils', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        githubUtils.resetOctokitFactoryForTesting();
    });

    teardown(() => {
        githubUtils.resetOctokitFactoryForTesting();
        sandbox.restore();
    });

    suite('parseGitHubUrl', () => {
        test('should parse https url correctly', () => {
            const url = 'https://github.com/owner/repo';
            const result = githubUtils.parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('should parse http url correctly', () => {
            const url = 'http://github.com/owner/repo';
            const result = githubUtils.parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('should parse https url with .git correctly', () => {
            const url = 'https://github.com/owner/repo.git';
            const result = githubUtils.parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('should parse ssh url correctly', () => {
            const url = 'git@github.com:owner/repo.git';
            const result = githubUtils.parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('should parse ssh url without .git correctly', () => {
            const url = 'git@github.com:owner/repo';
            const result = githubUtils.parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('should parse owner and repo with hyphens and dots', () => {
            assert.deepStrictEqual(githubUtils.parseGitHubUrl('https://github.com/my-owner/my-repo'), { owner: 'my-owner', repo: 'my-repo' });
            assert.deepStrictEqual(githubUtils.parseGitHubUrl('https://github.com/owner/repo.js'), { owner: 'owner', repo: 'repo.js' });
        });

        test('should return null for non-repository paths', () => {
            assert.strictEqual(githubUtils.parseGitHubUrl('https://github.com/owner/repo/blob/main/file.ts'), null);
        });

        test('should return null for invalid urls', () => {
            assert.strictEqual(githubUtils.parseGitHubUrl('invalid-url'), null);
            assert.strictEqual(githubUtils.parseGitHubUrl('https://gitlab.com/owner/repo'), null);
        });
    });

    suite('getOctokitInstance', () => {
        test('should return an Octokit instance', async () => {
            const instance = await githubUtils.getOctokitInstance('dummy-token');
            assert.strictEqual(typeof instance, 'object');
            assert.ok(instance.request);
        });
    });

    suite('getPullRequestBranchInfo', () => {
        test('should return null if API request fails', async () => {
            githubUtils.setOctokitFactoryForTesting(async () => {
                throw new Error('API error');
            });
            const result = await githubUtils.getPullRequestBranchInfo('invalid-token', 'owner', 'repo', 1);
            assert.strictEqual(result, null);
        });

        test('should return null if API request fails with non-Error', async () => {
            githubUtils.setOctokitFactoryForTesting(() => Promise.reject('String error'));
            const result = await githubUtils.getPullRequestBranchInfo('invalid-token', 'owner', 'repo', 1);
            assert.strictEqual(result, null);
        });

        test('should return null if PR head repo is null', async () => {
            const mockOctokit = {
                pulls: {
                    get: sandbox.stub().resolves({
                        data: {
                            head: { repo: null },
                            base: { ref: 'main' },
                            state: 'open',
                            title: 'Test PR',
                            merged: false
                        }
                    })
                }
            };

            githubUtils.setOctokitFactoryForTesting(async () => mockOctokit as any);

            const result = await githubUtils.getPullRequestBranchInfo('token', 'owner', 'repo', 1);
            assert.strictEqual(result, null);
        });

        test('should return branch info successfully', async () => {
            const mockOctokit = {
                pulls: {
                    get: sandbox.stub().resolves({
                        data: {
                            head: {
                                ref: 'feature-branch',
                                repo: {
                                    owner: { login: 'owner' },
                                    name: 'repo',
                                    clone_url: 'https://github.com/owner/repo.git'
                                }
                            },
                            base: { ref: 'main' },
                            state: 'open',
                            title: 'Test PR',
                            merged: false
                        }
                    })
                }
            };

            githubUtils.setOctokitFactoryForTesting(async () => mockOctokit as any);

            const result = await githubUtils.getPullRequestBranchInfo('token', 'owner', 'repo', 1);
            assert.deepStrictEqual(result, {
                headBranch: 'feature-branch',
                baseBranch: 'main',
                headOwner: 'owner',
                headRepo: 'repo',
                headCloneUrl: 'https://github.com/owner/repo.git',
                state: 'open',
                title: 'Test PR'
            });
        });

        test('should return correct state when merged is true', async () => {
            const mockOctokit = {
                pulls: {
                    get: sandbox.stub().resolves({
                        data: {
                            head: {
                                ref: 'feature-branch',
                                repo: {
                                    owner: { login: 'owner' },
                                    name: 'repo',
                                    clone_url: 'https://github.com/owner/repo.git'
                                }
                            },
                            base: { ref: 'main' },
                            state: 'closed',
                            title: 'Test PR',
                            merged: true
                        }
                    })
                }
            };

            githubUtils.setOctokitFactoryForTesting(async () => mockOctokit as any);

            const result = await githubUtils.getPullRequestBranchInfo('token', 'owner', 'repo', 1);
            assert.strictEqual(result?.state, 'merged');
        });
    });

    suite('createRemoteBranch', () => {
        test('should create branch successfully', async () => {
            const mockCreateRef = sandbox.stub().resolves();
            const mockOctokit = {
                repos: {
                    get: sandbox.stub().resolves({ data: { default_branch: 'main' } })
                },
                git: {
                    getRef: sandbox.stub().resolves({ data: { object: { sha: '1234567890abcdef' } } }),
                    createRef: mockCreateRef
                }
            };
            githubUtils.setOctokitFactoryForTesting(async () => mockOctokit as any);

            await githubUtils.createRemoteBranch('token', 'owner', 'repo', 'new-branch');

            sinon.assert.calledOnceWithExactly(mockCreateRef, {
                owner: 'owner',
                repo: 'repo',
                ref: 'refs/heads/new-branch',
                sha: '1234567890abcdef'
            });
        });

        test('should throw error if getOctokitInstance throws', async () => {
            githubUtils.setOctokitFactoryForTesting(async () => {
                throw new Error('Auth failed');
            });
            await assert.rejects(githubUtils.createRemoteBranch('token', 'owner', 'repo', 'new-branch'), /Auth failed/);
        });
    });
});
