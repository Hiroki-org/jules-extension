
import * as assert from 'assert';
import * as sinon from 'sinon';
import { parseGitHubUrl, createRemoteBranch, getPullRequestBranchInfo } from '../githubUtils';

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


    suite('GitHub API Mocked Tests with nock', () => {
        let warnStub: sinon.SinonStub;
        let errorStub: sinon.SinonStub;
        const nock = require('nock');

        setup(() => {
            warnStub = sandbox.stub(console, 'warn');
            errorStub = sandbox.stub(console, 'error');
            nock.disableNetConnect();
        });

        teardown(() => {
            nock.cleanAll();
            nock.enableNetConnect();
        });

        test('createRemoteBranch creates branch successfully', async () => {
            nock('https://api.github.com')
                .get('/repos/owner/repo')
                .reply(200, { default_branch: 'main' });

            nock('https://api.github.com')
                .get('/repos/owner/repo/git/ref/heads%2Fmain')
                .reply(200, { object: { sha: 'base-sha' } });

            nock('https://api.github.com')
                .post('/repos/owner/repo/git/refs', {
                    ref: 'refs/heads/feature-branch',
                    sha: 'base-sha'
                })
                .reply(201, {});

            await createRemoteBranch('token', 'owner', 'repo', 'feature-branch');
            assert.ok(true); // if it doesn't throw, it passed
        });

        test('getPullRequestBranchInfo returns branch info successfully', async () => {
            nock('https://api.github.com')
                .get('/repos/owner/repo/pulls/1')
                .reply(200, {
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
                });

            const result = await getPullRequestBranchInfo('token', 'owner', 'repo', 1);

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

        test('getPullRequestBranchInfo returns null when head.repo is missing', async () => {
            nock('https://api.github.com')
                .get('/repos/owner/repo/pulls/1')
                .reply(200, {
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
                });

            const result = await getPullRequestBranchInfo('token', 'owner', 'repo', 1);

            assert.strictEqual(result, null);
            sinon.assert.calledWith(warnStub, '[Jules] PR head repository is null (possibly deleted fork)');
        });

        test('getPullRequestBranchInfo returns null and logs error when API fails with Error', async () => {
            nock('https://api.github.com')
                .get('/repos/owner/repo/pulls/1')
                .replyWithError('Network error');

            const result = await getPullRequestBranchInfo('token', 'owner', 'repo', 1);

            assert.strictEqual(result, null);
            sinon.assert.calledWithMatch(errorStub, /^\[Jules\] Failed to get PR branch info: /);
        });

        test('getPullRequestBranchInfo handles merged state', async () => {
            nock('https://api.github.com')
                .get('/repos/owner/repo/pulls/1')
                .reply(200, {
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
                });

            const result = await getPullRequestBranchInfo('token', 'owner', 'repo', 1);

            assert.strictEqual(result?.state, 'merged');
        });
    });
});
