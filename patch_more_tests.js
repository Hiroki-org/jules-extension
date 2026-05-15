const fs = require('fs');

let contentTest = fs.readFileSync('src/test/extensionHelpers.unit.test.ts', 'utf8');

const moreTests = `
    test("should handle missing API key", async () => {
      mockContext.secrets.get.resolves(undefined);
      windowMock.expects("showWarningMessage").once().resolves("Delete");
      windowMock.expects("withProgress").never();
      await executeDeleteSessionCommand(mockContext, mockSessionsProvider, mockItem1, []);
      windowMock.verify();
    });

    test("should handle invalid session ID", async () => {
      windowMock.expects("showWarningMessage").once().resolves("Delete");
      windowMock.expects("withProgress").once().callsFake(async (opts: any, task: any) => {
        const progress = { report: sinon.stub() };
        await task(progress);
      });
      windowMock.expects("showErrorMessage").withExactArgs("Invalid session ID: invalid/session/id").once().resolves();
      windowMock.expects("showWarningMessage").withExactArgs(sinon.match(/Deleted 0 sessions, but failed to delete 1 sessions/)).once().resolves();

      const invalidItem = { session: { name: "invalid/session/id", title: "Invalid" } };
      sinon.stub(invalidItem, "constructor").get(() => SessionTreeItem);
      Object.setPrototypeOf(invalidItem, SessionTreeItem.prototype);

      await executeDeleteSessionCommand(mockContext, mockSessionsProvider, invalidItem as any, []);
      windowMock.verify();
    });

    test("should handle multiple session deletion with all success", async () => {
      windowMock.expects("showWarningMessage").once().resolves("Delete");
      windowMock.expects("withProgress").once().callsFake(async (opts: any, task: any) => {
        const progress = { report: sinon.stub() };
        await task(progress);
      });
      windowMock.expects("showInformationMessage").withExactArgs("Successfully deleted 2 sessions.").once().resolves();

      const fetchStub = sinon.stub(fetchUtils, "fetchWithTimeout").resolves({ ok: true, status: 200 } as any);

      await executeDeleteSessionCommand(mockContext, mockSessionsProvider, mockItem1, [mockItem1, mockItem2]);
      windowMock.verify();
      assert.strictEqual(fetchStub.calledTwice, true);
    });
`;

if (!contentTest.includes('should handle missing API key')) {
  // Find where to insert inside executeDeleteSessionCommand suite
  const suiteStart = contentTest.indexOf('suite("executeDeleteSessionCommand"');
  if (suiteStart > -1) {
    const endOfSuite = contentTest.indexOf('});', suiteStart + 50);
    // actually, let's just replace the last test inside the suite with itself + more tests
    const marker = `    test("should handle multiple session deletion with some failures"`;
    if (contentTest.includes(marker)) {
      contentTest = contentTest.replace(marker, moreTests + '\n' + marker);
      fs.writeFileSync('src/test/extensionHelpers.unit.test.ts', contentTest);
      console.log('Added more tests');
    }
  }
}
