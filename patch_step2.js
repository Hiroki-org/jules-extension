const fs = require('fs');
let content = fs.readFileSync('src/extension.ts', 'utf8');

const target2 = `      addToActivitiesCache(sessionId, activities);`;
const insert2 = `

      this._onDidFetchActivities.fire({ sessionId, activities });`;

if (content.includes(target2) && !content.includes('this._onDidFetchActivities.fire')) {
  content = content.replace(target2, target2 + insert2);
  fs.writeFileSync('src/extension.ts', content);
  console.log('Success step 2');
} else {
  console.log('Failed step 2 or already inserted');
}
