const fs = require('fs');
let content = fs.readFileSync('src/test/sessionContextMenu.checkout.unit.test.ts', 'utf8');

const search = `    it('checkoutToBranchForSession covers fallback to headCloneUrl', async () => {`;

const replace = `    it('checkoutToBranchForSession covers fallback to headCloneUrl', async () => {
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
                    { remote: 'fork-remote', fetchUrl: 'https://github.com/fork-owner/fork-repo.git' } // Ends with .git
                ]
            },
            fetch: sandbox.stub().resolves(),
            checkout: sandbox.stub().resolves()
        };

        mockGitAPI.repositories = [mockRepo];

        const result = await checkoutToBranchForSession(mockSession);
        assert.strictEqual(result, true);
    });

    it('checkoutToBranchForSession covers fallback to headCloneUrl when fetchUrl does not end with .git', async () => {`;

content = content.replace(search, replace);
fs.writeFileSync('src/test/sessionContextMenu.checkout.unit.test.ts', content);
console.log("Updated tests to hit coverage branch.");
