const fs = require('fs');
let contentTest = fs.readFileSync('src/test/extensionHelpers.unit.test.ts', 'utf8');

contentTest = contentTest.replace(/sinon\.stub\(invalidItem, "constructor"\)/g, 'sinon.stub(invalidItem as any, "constructor")');

fs.writeFileSync('src/test/extensionHelpers.unit.test.ts', contentTest);
