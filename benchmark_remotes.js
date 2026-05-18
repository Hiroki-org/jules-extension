const { performance } = require('perf_hooks');

const remotes = [];
for (let i = 0; i < 10000; i++) {
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
    const remotesByUrl = new Map();
    const remotesByName = new Map();

    for (const r of remotes) {
        if (r.fetchUrl) {
            if (!remotesByUrl.has(r.fetchUrl)) {
                remotesByUrl.set(r.fetchUrl, r);
            }
            const fetchUrlNoGit = r.fetchUrl.replace(/\.git$/, '');
            if (!remotesByUrl.has(fetchUrlNoGit)) {
                remotesByUrl.set(fetchUrlNoGit, r);
            }
        }
        if (r.remote) {
            if (!remotesByName.has(r.remote)) {
                remotesByName.set(r.remote, r);
            }
        }
    }

    let targetRemote = remotesByUrl.get(headCloneUrl) || remotesByUrl.get(headCloneUrlNoGit);

    if (!targetRemote) {
        const originRemote = remotesByName.get('origin');
        if (originRemote?.fetchUrl?.includes(`headOwner/headRepo`)) {
            targetRemote = originRemote;
        }
    }
    return targetRemote;
}

// Warmup
for (let i = 0; i < 100; i++) {
    runBaseline();
    runOptimized();
}

let start = performance.now();
for (let i = 0; i < 1000; i++) {
    runBaseline();
}
console.log(`Baseline: ${performance.now() - start} ms`);

start = performance.now();
for (let i = 0; i < 1000; i++) {
    runOptimized();
}
console.log(`Optimized: ${performance.now() - start} ms`);
