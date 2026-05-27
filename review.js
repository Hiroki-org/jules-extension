const fs = require('fs');
const content = fs.readFileSync('src/webview/chatAssets.ts', 'utf8');
if (content.includes('function replaceChildren(element, nodes) {')) {
  console.log('replaceChildren IS defined as a global helper function');
}
