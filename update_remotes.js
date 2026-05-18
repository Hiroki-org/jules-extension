const fs = require('fs');

let content = fs.readFileSync('src/sessionContextMenu.ts', 'utf8');

const search = `        const remotes: { remote: string; fetchUrl: string }[] = repository.state?.remotes || [];

        const headCloneUrlNoGit = headCloneUrl.replace(/\\.git$/, '');

        // headCloneUrlに一致するリモートを探す
        let targetRemote = remotes.find(r =>
            r.fetchUrl === headCloneUrl ||
            (r.fetchUrl && r.fetchUrl.replace(/\\.git$/, '') === headCloneUrlNoGit)
        );

        // フォークからのPRで、対応するリモートがない場合
        if (!targetRemote) {
            // origin/upstreamを確認
            const originRemote = remotes.find(r => r.remote === 'origin');

            // originがheadCloneUrlと同じなら、originを使う
            if (originRemote?.fetchUrl?.includes(\`\${headOwner}/\${headRepo}\`)) {
                targetRemote = originRemote;
            } else {`;

const replace = `        const remotes: { remote: string; fetchUrl: string }[] = repository.state?.remotes || [];

        const headCloneUrlNoGit = headCloneUrl.endsWith('.git') ? headCloneUrl.slice(0, -4) : headCloneUrl;

        let targetRemote: { remote: string; fetchUrl: string } | undefined;
        let originRemote: { remote: string; fetchUrl: string } | undefined;

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

            // 両方見つかれば早期終了
            if (targetRemote && originRemote) break;
        }

        // フォークからのPRで、対応するリモートがない場合
        if (!targetRemote) {
            // originがheadCloneUrlと同じなら、originを使う
            if (originRemote?.fetchUrl?.includes(\`\${headOwner}/\${headRepo}\`)) {
                targetRemote = originRemote;
            } else {`;

if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync('src/sessionContextMenu.ts', content);
    console.log("Successfully patched src/sessionContextMenu.ts");
} else {
    console.log("Failed to find the string to replace.");
}
