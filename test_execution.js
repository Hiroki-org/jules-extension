const { execSync } = require('child_process');

try {
  execSync('npx c8 npm run test:unit', { stdio: 'inherit' });
} catch (e) {
  console.log("Error running tests");
}

try {
  const coverage = require('./coverage/coverage-summary.json');
  console.log(JSON.stringify(coverage['src/extension.ts'].lines, null, 2));
} catch(e) {
  console.log("Could not read coverage", e);
}
