const fs = require('fs');
let content = fs.readFileSync('src/test/sessionContextMenu.checkout.unit.test.ts', 'utf8');

const search = `    it('dummy', async () => {`;

const replace = `    it('checkoutToBranchForSession covers fetchAndCheckoutFromPRInfo when rFetchUrlNoGit does not match', async () => {
        // Set up mock repositories and fetch info to trigger the condition
        mockBranchInfo = {
            headBranch: 'feature/pr-123',
            headOwner: 'fork-owner',
            headRepo: 'fork-repo',
            headCloneUrl: 'https://github.com/fork-owner/fork-repo.git'
        };

        const mockRepo = {
            state: {
                remotes: [
                    { remote: 'origin', fetchUrl: 'https://github.com/owner/repo.git' },
                    { remote: 'fork-remote', fetchUrl: 'https://github.com/other/other.git' } // Different URL
                ]
            },
            fetch: sandbox.stub().rejects(new Error('Should not reach here')),
            checkout: sandbox.stub().rejects(new Error('Should not reach here')),
            addRemote: sandbox.stub().rejects(new Error('Stop')) // early abort
        };

        mockGitAPI.repositories = [mockRepo];

        // Should return false due to addRemote rejecting
        const result = await checkoutToBranchForSession(mockSession);
        assert.strictEqual(result, false);
    });

    it('checkoutToBranchForSession covers fallback to headCloneUrl', async () => {
        mockBranchInfo = {
            headBranch: 'feature/pr-123',
            headOwner: 'fork-owner',
            headRepo: 'fork-repo',
            headCloneUrl: 'https://github.com/fork-owner/fork-repo'
        };

        const mockRepo = {
            state: {
                remotes: [
                    { remote: 'origin', fetchUrl: 'https://github.com/owner/repo.git' },
                    { remote: 'fork-remote', fetchUrl: 'https://github.com/fork-owner/fork-repo' }
                ]
            },
            fetch: sandbox.stub().resolves(),
            checkout: sandbox.stub().resolves()
        };

        mockGitAPI.repositories = [mockRepo];

        const result = await checkoutToBranchForSession(mockSession);
        assert.strictEqual(result, true);
    });`;

content = content.replace(search, replace);
fs.writeFileSync('src/test/sessionContextMenu.checkout.unit.test.ts', content);
console.log("Updated tests to hit coverage branch.");
