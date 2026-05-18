const fs = require('fs');
let content = fs.readFileSync('src/test/sessionContextMenu.checkout.unit.test.ts', 'utf8');

const search = `    it('checkoutToBranchForSession covers fallback to headCloneUrl', async () => {`;

const replace = `    it('checkoutToBranchForSession covers fallback to headCloneUrl when fetchUrl does not match and does not end with .git', async () => {
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
                    { remote: 'fork-remote', fetchUrl: 'https://github.com/other-owner/other-repo.git' } // Ends with .git but different URL
                ]
            },
            fetch: sandbox.stub().rejects(new Error('Stop')),
            checkout: sandbox.stub().rejects(new Error('Stop')),
            addRemote: sandbox.stub().rejects(new Error('Stop'))
        };

        mockGitAPI.repositories = [mockRepo];

        const result = await checkoutToBranchForSession(mockSession);
        assert.strictEqual(result, false);
    });

    it('checkoutToBranchForSession covers fallback to headCloneUrl', async () => {`;

content = content.replace(search, replace);
fs.writeFileSync('src/test/sessionContextMenu.checkout.unit.test.ts', content);
console.log("Updated tests to hit coverage branch.");
