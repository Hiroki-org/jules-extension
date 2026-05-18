const { execSync } = require('child_process');

try {
    execSync('git add src/test/sessionContextMenu.checkout.unit.test.ts');
    execSync('git commit --amend --no-edit');
    console.log("Successfully amended commit with test updates.");
} catch(e) {
    console.error(e.stdout ? e.stdout.toString() : e);
}
