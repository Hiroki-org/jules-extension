sed -i "s/replace(\/\\\\\.git\\\\$\/, '')/endsWith('.git') ? headCloneUrl.slice(0, -4) : headCloneUrl/g" src/sessionContextMenu.ts
sed -i "s/r\.fetchUrl\.replace(\/\\\\\.git\\\\$\/, '')/r.fetchUrl.endsWith('.git') ? r.fetchUrl.slice(0, -4) : r.fetchUrl/g" src/sessionContextMenu.ts
sed -i 's/replace(\/\^sessions\\\\\\\/\\/, "")/startsWith("sessions\/") ? sessionId.slice(9) : sessionId/g' src/sessionContextMenuArtifacts.ts
sed -i 's/replace(\/\^sessions\\\\\\\/\\/, "")/startsWith("sessions\/") ? sessionId.slice(9) : sessionId/g' src/extension.ts
sed -i 's/replace(\/\^sessions\\\\\\\/\\/, "")/startsWith("sessions\/") ? sessionId.slice(9) : sessionId/g' src/planDocumentProvider.ts

cat << 'INNEREOF' >> .jules/bolt.md

## 2026-05-18 - [Performance] Optimize regex replacement with startsWith/endsWith
**Learning:** Using regular expressions like \`replace(/\\.git$/, '')\` or \`replace(/^sessions\\//, '')\` in loops or frequently called utility functions introduces unnecessary overhead from regex compilation and execution compared to simple string matching methods.
**Action:** When conditionally removing a fixed string prefix or suffix, use \`.startsWith()\` or \`.endsWith()\` combined with \`.slice()\` (e.g., \`str.endsWith('.git') ? str.slice(0, -4) : str\`) instead of \`replace()\` with a regular expression to improve execution speed.
INNEREOF

cat << 'INNEREOF' > patch_tests.js
const fs = require('fs');

const path = 'src/test/sessionContextMenu.checkout.unit.test.ts';
let content = fs.readFileSync(path, 'utf8');

const testCode = \`    test('checkoutToBranchForSession covers fetchAndCheckoutFromPRInfo success when headCloneUrl matches without trailing git suffix against fetchUrl without trailing git suffix', async () => {
        const repo = createRepository({
            state: {
                HEAD: { name: 'main' },
                workingTreeChanges: [],
                indexChanges: [],
                remotes: [{ remote: 'fork-remote', fetchUrl: 'https://github.com/fork-owner/fork-repo' }]
            },
            checkout: sandbox.stub().resolves(),
            fetch: sandbox.stub().resolves()
        });
        stubGitExtension([repo]);
        sandbox.stub(GitHubAuth, 'getToken').resolves('token');
        sandbox.stub(githubUtils, 'getPullRequestBranchInfo').resolves({
            headBranch: 'feature/pr-123',
            baseBranch: 'main',
            headOwner: 'fork-owner',
            headRepo: 'fork-repo',
            headCloneUrl: 'https://github.com/fork-owner/fork-repo',
            state: 'open',
            title: 'Test PR'
        });

        const session = {
            name: 'session-match-no-git',
            title: 'Session Match No Git',
            outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/123' } }]
        } as unknown as Session;

        const result = await sessionContextMenu.checkoutToBranchForSession(session, createOutputChannel());
        assert.strictEqual(result, true);
    });

    test('checkoutToBranchForSession covers fetchAndCheckoutFromPRInfo success when headCloneUrl with git matches fetchUrl without git', async () => {
        const repo = createRepository({
            state: {
                HEAD: { name: 'main' },
                workingTreeChanges: [],
                indexChanges: [],
                remotes: [{ remote: 'fork-remote', fetchUrl: 'https://github.com/fork-owner/fork-repo' }]
            },
            checkout: sandbox.stub().resolves(),
            fetch: sandbox.stub().resolves()
        });
        stubGitExtension([repo]);
        sandbox.stub(GitHubAuth, 'getToken').resolves('token');
        sandbox.stub(githubUtils, 'getPullRequestBranchInfo').resolves({
            headBranch: 'feature/pr-123',
            baseBranch: 'main',
            headOwner: 'fork-owner',
            headRepo: 'fork-repo',
            headCloneUrl: 'https://github.com/fork-owner/fork-repo.git',
            state: 'open',
            title: 'Test PR'
        });

        const session = {
            name: 'session-match-no-git',
            title: 'Session Match No Git',
            outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/123' } }]
        } as unknown as Session;

        const result = await sessionContextMenu.checkoutToBranchForSession(session, createOutputChannel());
        assert.strictEqual(result, true);
    });\n\n\`;

const targetRegex = /    test\\('checkoutToBranchForSession covers fetchAndCheckoutFromPRInfo catch block on exception', async \\(\\) => \\{/g;
let match = targetRegex.exec(content);
if (match) {
    content = content.slice(0, match.index) + testCode + content.slice(match.index);
    fs.writeFileSync(path, content);
} else {
    console.log("Not found.");
}
INNEREOF
node patch_tests.js
