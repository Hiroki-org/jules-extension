1. **Add an event emitter to `JulesSessionsProvider`**
   - Add `private _onDidFetchActivities = new vscode.EventEmitter<{ sessionId: string, activities: Activity[] }>();` to `JulesSessionsProvider` in `src/extension.ts`.
   - Add `public readonly onDidFetchActivities = this._onDidFetchActivities.event;`.

2. **Trigger the event during background update**
   - Inside `JulesSessionsProvider.updateProgressStatusBarForSelectedSession`, after updating the cache with `newActivities`, fire the event: `this._onDidFetchActivities.fire({ sessionId, activities });`.

3. **Subscribe to the event**
   - In the `activate` function in `src/extension.ts`, right after creating `sessionsProvider`, subscribe to `sessionsProvider.onDidFetchActivities`:
     ```typescript
     sessionsProvider.onDidFetchActivities(({ sessionId, activities }) => {
       const selectedSessionId = context.globalState.get<string>("active-session-id");
       if (sessionId === selectedSessionId) {
         const session = getSessionDetails(sessionId);
         chatViewProvider.updateSession(
           sessionId,
           activities,
           session?.state,
           session?.title,
           session?.createTime
         );
       }
     });
     ```
4. **Pre-commit checks**
   - Complete pre-commit checks.
