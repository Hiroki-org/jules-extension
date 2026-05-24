const fs = require('fs');
let code = fs.readFileSync('src/test/inlineCommands.unit.test.ts', 'utf8');

code = code.replace(
    'assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).calledWith("No code selected to refactor."));',
    'assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).calledWith("No code selected to refactor."));\n        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).calledTwice);' // just verify
);

fs.writeFileSync('src/test/inlineCommands.unit.test.ts', code);
