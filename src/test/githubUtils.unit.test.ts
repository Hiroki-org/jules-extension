
import * as assert from 'assert';
import * as sinon from 'sinon';
import { parseGitHubUrl } from '../githubUtils';
import * as proxyquire from 'proxyquire';

suite('GitHub Utils Unit Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('parseGitHubUrl', () => {
        test('parseGitHubUrl は標準的な HTTPS URL を正しく解析すること', () => {
            const url = 'https://github.com/owner/repo';
            const result = parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('parseGitHubUrl は .git 付きの HTTPS URL を正しく解析すること', () => {
            const url = 'https://github.com/owner/repo.git';
            const result = parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('parseGitHubUrl は http プロトコルの URL を正しく解析すること', () => {
            const url = 'http://github.com/owner/repo.git';
            const result = parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('parseGitHubUrl は SSH URL (コロン区切り) を正しく解析すること', () => {
            const url = 'git@github.com:owner/repo.git';
            const result = parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('parseGitHubUrl は .git なしの SSH URL を正しく解析すること', () => {
            const url = 'git@github.com:owner/repo';
            const result = parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo' });
        });

        test('parseGitHubUrl は github.com 以外のドメインの場合に null を返すこと', () => {
            const url = 'https://gitlab.com/owner/repo.git';
            const result = parseGitHubUrl(url);
            assert.strictEqual(result, null);
        });

        test('parseGitHubUrl は無効な形式の URL の場合に null を返すこと', () => {
            const url = 'not-a-url';
            const result = parseGitHubUrl(url);
            assert.strictEqual(result, null);
        });

        test('parseGitHubUrl はリポジトリルート以外のパスが含まれる場合に null を返すこと', () => {
            const url = 'https://github.com/owner/repo/blob/main/README.md';
            const result = parseGitHubUrl(url);
            assert.strictEqual(result, null);
        });

        test('parseGitHubUrl はハイフンを含むユーザー名やリポジトリ名を正しく処理すること', () => {
            const url = 'https://github.com/my-owner/my-repo.git';
            const result = parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'my-owner', repo: 'my-repo' });
        });

        test('parseGitHubUrl はドットを含むリポジトリ名を正しく処理すること', () => {
            const url = 'https://github.com/owner/repo.js.git';
            const result = parseGitHubUrl(url);
            assert.deepStrictEqual(result, { owner: 'owner', repo: 'repo.js' });
        });
    });

    suite('GitHub API Mocked Tests', () => {
        let getStub: sinon.SinonStub;
        let getRefStub: sinon.SinonStub;
        let createRefStub: sinon.SinonStub;
        let pullsGetStub: sinon.SinonStub;
        let mockedUtils: any;

        setup(() => {
            getStub = sandbox.stub();
            getRefStub = sandbox.stub();
            createRefStub = sandbox.stub();
            pullsGetStub = sandbox.stub();

            class MockOctokit {
                repos = { get: getStub };
                git = { getRef: getRefStub, createRef: createRefStub };
                pulls = { get: pullsGetStub };
                constructor() {}
            }

            // Using proxyquire to mock the module
            mockedUtils = proxyquire.noCallThru().load('../githubUtils', {
                '@octokit/rest': { Octokit: MockOctokit }
            });
        });

        suite('createRemoteBranch', () => {
            test('creates branch successfully', async () => {
                getStub.resolves({ data: { default_branch: 'main' } });
                getRefStub.resolves({ data: { object: { sha: 'base-sha' } } });
                createRefStub.resolves();

                await mockedUtils.createRemoteBranch('token', 'owner', 'repo', 'feature-branch');

                sinon.assert.calledWith(getStub, { owner: 'owner', repo: 'repo' });
                sinon.assert.calledWith(getRefStub, { owner: 'owner', repo: 'repo', ref: 'heads/main' });
                sinon.assert.calledWith(createRefStub, {
                    owner: 'owner',
                    repo: 'repo',
                    ref: 'refs/heads/feature-branch',
                    sha: 'base-sha'
                });
            });
        });

        suite('getPullRequestBranchInfo', () => {
            test('returns branch info successfully', async () => {
                pullsGetStub.resolves({
                    data: {
                        head: {
                            ref: 'feature-branch',
                            repo: {
                                owner: { login: 'fork-owner' },
                                name: 'fork-repo',
                                clone_url: 'https://clone.url'
                            }
                        },
                        base: {
                            ref: 'main'
                        },
                        merged: false,
                        state: 'open',
                        title: 'PR Title'
                    }
                });

                const result = await mockedUtils.getPullRequestBranchInfo('token', 'owner', 'repo', 1);

                assert.deepStrictEqual(result, {
                    headBranch: 'feature-branch',
                    baseBranch: 'main',
                    headOwner: 'fork-owner',
                    headRepo: 'fork-repo',
                    headCloneUrl: 'https://clone.url',
                    state: 'open',
                    title: 'PR Title'
                });
            });

            test('returns null when head.repo is missing', async () => {
                pullsGetStub.resolves({
                    data: {
                        head: {
                            ref: 'feature-branch',
                            repo: null
                        },
                        base: {
                            ref: 'main'
                        },
                        merged: false,
                        state: 'open',
                        title: 'PR Title'
                    }
                });

                const warnStub = sandbox.stub(console, 'warn');
                const result = await mockedUtils.getPullRequestBranchInfo('token', 'owner', 'repo', 1);

                assert.strictEqual(result, null);
                sinon.assert.calledWith(warnStub, '[Jules] PR head repository is null (possibly deleted fork)');
            });

            test('returns null and logs error when API fails with Error', async () => {
                pullsGetStub.rejects(new Error('API Error'));
                const errorStub = sandbox.stub(console, 'error');

                const result = await mockedUtils.getPullRequestBranchInfo('token', 'owner', 'repo', 1);

                assert.strictEqual(result, null);
                sinon.assert.calledWith(errorStub, '[Jules] Failed to get PR branch info: API Error');
            });

            test('handles merged state', async () => {
                pullsGetStub.resolves({
                    data: {
                        head: {
                            ref: 'feature-branch',
                            repo: {
                                owner: { login: 'fork-owner' },
                                name: 'fork-repo',
                                clone_url: 'https://clone.url'
                            }
                        },
                        base: {
                            ref: 'main'
                        },
                        merged: true,
                        state: 'closed',
                        title: 'PR Title'
                    }
                });

                const result = await mockedUtils.getPullRequestBranchInfo('token', 'owner', 'repo', 1);

                assert.strictEqual(result.state, 'merged');
            });
        });
    });
});
