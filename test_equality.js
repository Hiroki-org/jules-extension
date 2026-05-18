const assert = require('assert');

function runBaseline(remotes, headCloneUrl, headCloneUrlNoGit) {
    let targetRemote = remotes.find(r =>
        r.fetchUrl === headCloneUrl ||
        (r.fetchUrl && r.fetchUrl.replace(/\.git$/, '') === headCloneUrlNoGit)
    );

    if (!targetRemote) {
        const originRemote = remotes.find(r => r.remote === 'origin');
        if (originRemote?.fetchUrl?.includes(`headOwner/headRepo`)) {
            targetRemote = originRemote;
        }
    }
    return targetRemote;
}

function runOptimized(remotes, headCloneUrl, headCloneUrlNoGit) {
    let targetRemote = undefined;
    let originRemote = undefined;

    for (const r of remotes) {
        if (!targetRemote) {
            if (r.fetchUrl === headCloneUrl) {
                targetRemote = r;
            } else if (r.fetchUrl) {
                const rFetchUrlNoGit = r.fetchUrl.endsWith('.git') ? r.fetchUrl.slice(0, -4) : r.fetchUrl;
                if (rFetchUrlNoGit === headCloneUrlNoGit) {
                    targetRemote = r;
                }
            }
        }

        if (!originRemote && r.remote === 'origin') {
            originRemote = r;
        }

        // Both found, early exit
        if (targetRemote && originRemote) break;
    }

    if (!targetRemote && originRemote?.fetchUrl?.includes(`headOwner/headRepo`)) {
        targetRemote = originRemote;
    }

    return targetRemote;
}

const testCases = [
    {
        name: "Exact match headCloneUrl",
        remotes: [{ remote: 'r1', fetchUrl: 'https://foo' }, { remote: 'r2', fetchUrl: 'https://headOwner/headRepo.git' }],
        headCloneUrl: 'https://headOwner/headRepo.git',
        headCloneUrlNoGit: 'https://headOwner/headRepo'
    },
    {
        name: "NoGit match",
        remotes: [{ remote: 'r1', fetchUrl: 'https://foo' }, { remote: 'r2', fetchUrl: 'https://headOwner/headRepo' }],
        headCloneUrl: 'https://headOwner/headRepo.git',
        headCloneUrlNoGit: 'https://headOwner/headRepo'
    },
    {
        name: "Origin match",
        remotes: [{ remote: 'r1', fetchUrl: 'https://foo' }, { remote: 'origin', fetchUrl: 'https://github.com/headOwner/headRepo.git' }],
        headCloneUrl: 'https://some-fork/repo.git',
        headCloneUrlNoGit: 'https://some-fork/repo'
    },
    {
        name: "No match",
        remotes: [{ remote: 'r1', fetchUrl: 'https://foo' }, { remote: 'r2', fetchUrl: 'https://bar' }],
        headCloneUrl: 'https://some-fork/repo.git',
        headCloneUrlNoGit: 'https://some-fork/repo'
    }
];

testCases.forEach(tc => {
    const resBase = runBaseline(tc.remotes, tc.headCloneUrl, tc.headCloneUrlNoGit);
    const resOpt = runOptimized(tc.remotes, tc.headCloneUrl, tc.headCloneUrlNoGit);
    try {
        assert.deepStrictEqual(resBase, resOpt);
        console.log(`PASS: ${tc.name}`);
    } catch(e) {
        console.log(`FAIL: ${tc.name}`);
        console.log(`Baseline:`, resBase);
        console.log(`Optimized:`, resOpt);
    }
});
