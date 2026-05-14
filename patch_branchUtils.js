const fs = require('fs');

const fileContent = fs.readFileSync('src/branchUtils.ts', 'utf8');

const searchStr = `                repository = git.repositories.find((repo: any) => {
                    const repoPath = path.resolve(repo.rootUri.fsPath);
                    const relative = path.relative(repoPath, docPath);
                    // If relative is empty, docPath is the same as repoPath.
                    // If relative is not empty, it should not start with '..' and not be an absolute path.
                    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
                });`;

const replaceStr = `                // ⚡ Bolt 最適化: O(N * M) の Array.find と path.relative を O(D) の Map 探索に置換
                // N: リポジトリ数, M: path.relativeのコスト, D: docPathの深さ
                const repoMap = new Map<string, any>();
                for (const repo of git.repositories) {
                    repoMap.set(path.resolve(repo.rootUri.fsPath), repo);
                }

                let currentPath = docPath;
                while (currentPath && currentPath !== path.dirname(currentPath)) {
                    if (repoMap.has(currentPath)) {
                        repository = repoMap.get(currentPath);
                        break;
                    }
                    currentPath = path.dirname(currentPath);
                }`;

if (fileContent.includes(searchStr)) {
    const updatedContent = fileContent.replace(searchStr, replaceStr);
    fs.writeFileSync('src/branchUtils.ts', updatedContent);
    console.log('Successfully patched src/branchUtils.ts');
} else {
    console.log('Search string not found in src/branchUtils.ts');
}
