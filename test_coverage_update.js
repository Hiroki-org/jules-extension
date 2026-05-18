const fs = require('fs');
let content = fs.readFileSync('src/test/sessionContextMenu.checkout.unit.test.ts', 'utf8');

const search = `    it('checkoutToBranchForSession covers fetchAndCheckoutFromPRInfo success when headCloneUrl matches exactly without replace', async () => {`;

const replace = `    it('checkoutToBranchForSession covers fetchAndCheckoutFromPRInfo success when headCloneUrl matches exactly without replace', async () => {
        // Set up mock repositories and fetch info to trigger the condition
        mockBranchInfo = {
            headBranch: 'feature/pr-123',
            headOwner: 'fork-owner',
            headRepo: 'fork-repo',
            headCloneUrl: 'https://github.com/fork-owner/fork-repo.git' // Exact match via .git replace
        };

        const mockRepo = {
            state: {
                remotes: [
                    { remote: 'origin', fetchUrl: 'https://github.com/owner/repo.git' },
                    // Make the fetchUrl slightly different to hit the else if branch
                    // and use .endsWith('.git')
                    { remote: 'fork-remote', fetchUrl: 'https://github.com/fork-owner/fork-repo' }
                ]
            },
            fetch: sandbox.stub().resolves(),
            checkout: sandbox.stub().resolves()
        };

        mockGitAPI.repositories = [mockRepo];

        const result = await checkoutToBranchForSession(mockSession);

        assert.strictEqual(result, true);
        assert.ok(mockRepo.fetch.calledWith('fork-remote'), 'Should use fork-remote found via regex replace match');
        assert.ok(mockRepo.checkout.calledWith('feature/pr-123'));
    });

    it('checkoutToBranchForSession covers fetchAndCheckoutFromPRInfo success when headCloneUrl matches exactly without replace in else block', async () => {`;

content = content.replace(search, replace);
fs.writeFileSync('src/test/sessionContextMenu.checkout.unit.test.ts', content);
console.log("Updated tests to hit coverage branch.");
