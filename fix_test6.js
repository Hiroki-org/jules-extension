const fs = require('fs');
let code = fs.readFileSync('src/test/inlineCommands.unit.test.ts', 'utf8');

code = code.replace(
    'assert.ok((vscode.window.showErrorMessage as sinon.SinonSpy).calledWith("No code selected to refactor."));',
    'assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).calledWith("No code selected to refactor."));'
);
code = code.replace(
    'assert.ok((vscode.window.showErrorMessage as sinon.SinonSpy).calledWith("No code selected to generate tests for."));',
    'assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).calledWith("No code selected to generate tests for."));'
);

code = code.replace(
    'sandbox.stub(vscode.workspace, "getWorkspaceFolder" as keyof typeof vscode.workspace).returns({} as any);',
    '// getWorkspaceFolder is mocked at the module level in this test file'
);

fs.writeFileSync('src/test/inlineCommands.unit.test.ts', code);
