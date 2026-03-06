1. Add an event emitter to `JulesSessionsProvider` to notify when a selected session's activities are updated in the background.
2. In `updateProgressStatusBarForSelectedSession`, trigger the event when new activities are merged and updated.
3. Subcribe to this event in the chat view provider to update its view using the latest activities.
