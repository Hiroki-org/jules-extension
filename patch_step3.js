const fs = require('fs');
let content = fs.readFileSync('src/extension.ts', 'utf8');

const target3 = `  const chatViewProviderDisposable = vscode.window.registerWebviewViewProvider(
    "julesChatView",
    chatViewProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );`;

const insert3 = `

  context.subscriptions.push(
    sessionsProvider.onDidFetchActivities(({ sessionId, activities }) => {
      const currentSessionId = context.globalState.get("active-session-id") as string;
      if (sessionId === currentSessionId) {
        // Find session from cache
        const session = sessionsProvider.getSession(sessionId);
        chatViewProvider.updateSession(
          sessionId,
          activities,
          session?.rawState,
          session?.title,
          session?.createTime
        );
      }
    })
  );`;

if (content.includes(target3) && !content.includes('sessionsProvider.onDidFetchActivities(')) {
  content = content.replace(target3, target3 + insert3);
  fs.writeFileSync('src/extension.ts', content);
  console.log('Success step 3');
} else {
  console.log('Failed step 3 or already inserted');
}
