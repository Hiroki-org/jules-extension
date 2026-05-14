const path = require('path');
const { performance } = require('perf_hooks');

const numRepos = 100;
const repositories = [];
for (let i = 0; i < numRepos; i++) {
    repositories.push({
        rootUri: { fsPath: `/home/user/workspace/repo${i}` }
    });
}
const docPath = `/home/user/workspace/repo99/src/components/MyComponent/foo/bar/baz.ts`;

function baseline() {
    return repositories.find((repo) => {
        const repoPath = path.resolve(repo.rootUri.fsPath);
        const relative = path.relative(repoPath, docPath);
        return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    });
}

function optimized() {
    const repoMap = new Map();
    for (const repo of repositories) {
        repoMap.set(path.resolve(repo.rootUri.fsPath), repo);
    }

    let currentPath = docPath;
    let repository = undefined;
    while (currentPath && currentPath !== path.dirname(currentPath)) {
        if (repoMap.has(currentPath)) {
            repository = repoMap.get(currentPath);
            break;
        }
        currentPath = path.dirname(currentPath);
    }
    return repository;
}

const N = 10000;
let start = performance.now();
for (let i = 0; i < N; i++) baseline();
console.log('Baseline:', performance.now() - start);

start = performance.now();
for (let i = 0; i < N; i++) optimized();
console.log('Optimized:', performance.now() - start);
