const fs = require('fs');
let content = fs.readFileSync('src/extension.ts', 'utf8');

const target4 = `  setProgressStatusBarItem(item: vscode.StatusBarItem): void {
    this.progressStatusBarItem = item;
  }`;

const insert4 = `

  getSession(sessionId: string): Session | undefined {
    return this.sessionsCache.find(s => s.name === sessionId);
  }`;

if (content.includes(target4) && !content.includes('getSession(sessionId: string)')) {
  content = content.replace(target4, target4 + insert4);
  fs.writeFileSync('src/extension.ts', content);
  console.log('Success step 3.2');
} else {
  console.log('Failed step 3.2 or already inserted');
}
