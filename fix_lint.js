const fs = require('fs');
let content = fs.readFileSync('src/sessionContextMenu.ts', 'utf8');

const search = `            // 両方見つかれば早期終了
            if (targetRemote && originRemote) break;`;

const replace = `            // 両方見つかれば早期終了
            if (targetRemote && originRemote) {
                break;
            }`;

content = content.replace(search, replace);
fs.writeFileSync('src/sessionContextMenu.ts', content);
console.log("Lint issue fixed.");
