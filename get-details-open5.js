const fs = require('fs');
const content = fs.readFileSync('src/webview/chatAssets.ts', 'utf8');

const regex = /chatContainer\.innerHTML = state\.messages\.map\([\s\S]*?\}\);/;
const match = regex.exec(content);
if (match) {
  console.log(match[0]);
}
