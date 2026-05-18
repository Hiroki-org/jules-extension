const { performance } = require('perf_hooks');

const remotes = [];
for (let i = 0; i < 4; i++) {
    remotes.push({ remote: `remote${i}`, fetchUrl: `https://github.com/owner/repo${i}.git` });
}
remotes.push({ remote: 'origin', fetchUrl: 'https://github.com/headOwner/headRepo.git' });

const headCloneUrl = 'https://github.com/headOwner/headRepo.git';
const headCloneUrlNoGit = headCloneUrl.replace(/\.git$/, '');

function runBaseline() {
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

function runOptimized() {
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

// Warmup
for (let i = 0; i < 1000; i++) {
    runBaseline();
    runOptimized();
}

let start = performance.now();
for (let i = 0; i < 100000; i++) {
    runBaseline();
}
console.log(`Baseline: ${performance.now() - start} ms`);

start = performance.now();
for (let i = 0; i < 100000; i++) {
    runOptimized();
}
console.log(`Optimized: ${performance.now() - start} ms`);
