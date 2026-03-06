const fs = require('fs');
const content = fs.readFileSync('src/extension.ts', 'utf8');

const target1 = `private _onDidChangeTreeData: vscode.EventEmitter<`;
const insert1 = `  private _onDidFetchActivities = new vscode.EventEmitter<{ sessionId: string, activities: Activity[] }>();
  public readonly onDidFetchActivities = this._onDidFetchActivities.event;

  `;

if (content.includes(target1) && !content.includes('_onDidFetchActivities')) {
  fs.writeFileSync('src/extension.ts', content.replace(target1, insert1 + target1));
  console.log('Success step 1');
} else {
  console.log('Failed step 1 or already inserted');
}
