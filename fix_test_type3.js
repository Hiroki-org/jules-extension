const fs = require('fs');
let contentTest = fs.readFileSync('src/test/extensionHelpers.unit.test.ts', 'utf8');

// If 'invalid/session/id' is valid due to allowing slashes, we should pass something definitely invalid like 'invalid<>session'
contentTest = contentTest.replace(/invalid\/session\/id/g, 'invalid<session');

fs.writeFileSync('src/test/extensionHelpers.unit.test.ts', contentTest);
