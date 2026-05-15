import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as fetchUtils from "../fetchUtils";
import {
  fetchSessionActivitiesPaginated,
  JulesSessionsProvider,
  resetPaginationWarningState,
} from "../extension";

suite("Pagination limit tests", () => {
  let localSandbox: sinon.SinonSandbox;
  let fetchStub: sinon.SinonStub;
  let showWarningMessageStub: sinon.SinonStub;

  setup(() => {
    localSandbox = sinon.createSandbox();
    fetchStub = localSandbox.stub(fetchUtils, "fetchWithTimeout");
    showWarningMessageStub = localSandbox.stub(vscode.window, "showWarningMessage");
  });

  teardown(() => {
    resetPaginationWarningState();
    localSandbox.restore();
  });

  test("should gracefully break sessions pagination loop and NOT show warning if showPaginationProgress is false", async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        sessions: [{ name: "sessions/1" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);

    const mockContext = {
      globalState: { get: () => "dummyKey", update: async () => {} },
      secrets: { get: async () => "dummyApiKey" },
    } as any;
    const provider = new JulesSessionsProvider(mockContext);
    localSandbox.stub(provider as any, "_prefetchArtifactsForRecentSessions").resolves();


    await provider['fetchAndProcessSessions'](true);

    assert.strictEqual(fetchStub.callCount, 2);
    assert.strictEqual(showWarningMessageStub.called, false);
  });

  test("should gracefully break sessions pagination loop and show warning if showPaginationProgress is true", async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        sessions: [{ name: "sessions/1" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);

    const mockContext = {
      globalState: { get: () => "dummyKey", update: async () => {} },
      secrets: { get: async () => "dummyApiKey" },
    } as any;
    const provider = new JulesSessionsProvider(mockContext);
    localSandbox.stub(provider as any, "_prefetchArtifactsForRecentSessions").resolves();


    await provider['fetchAndProcessSessions'](false);

    assert.strictEqual(fetchStub.callCount, 2);
    assert.strictEqual(showWarningMessageStub.calledOnce, true);
  });

  test("should gracefully break activities pagination loop and NOT show warning if showPaginationProgress is false", async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        activities: [{ name: "activities/1", createTime: "2024-01-01T00:00:00Z" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);

    const activities = await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: false });

    assert.strictEqual(activities.length, 2);
    assert.strictEqual(fetchStub.callCount, 2);
    assert.strictEqual(showWarningMessageStub.called, false);
  });

  test("should not show sessions warning repeatedly when limit is hit continuously", async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        sessions: [{ name: "sessions/1" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);

    const mockContext = {
      globalState: { get: () => "dummyKey", update: async () => {} },
      secrets: { get: async () => "dummyApiKey" },
    } as any;
    const provider = new JulesSessionsProvider(mockContext);
    localSandbox.stub(provider as any, "_prefetchArtifactsForRecentSessions").resolves();

    // First foreground fetch hits limit -> shows warning
    await provider['fetchAndProcessSessions'](false);
    assert.strictEqual(showWarningMessageStub.callCount, 1);

    // Second foreground fetch hits limit -> does NOT show warning again
    await provider['fetchAndProcessSessions'](false);
    assert.strictEqual(showWarningMessageStub.callCount, 1);

    // Third background fetch hits limit -> does NOT show warning
    await provider['fetchAndProcessSessions'](true);
    assert.strictEqual(showWarningMessageStub.callCount, 1);

    // Now simulate a successful fetch that DOES NOT hit the limit
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        sessions: [{ name: "sessions/1" }],
        nextPageToken: undefined, // no more tokens
      }),
    } as any);
    await provider['fetchAndProcessSessions'](false);

    // Warning state should be reset now.
    // Simulate hitting limit again:
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        sessions: [{ name: "sessions/1" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);
    await provider['fetchAndProcessSessions'](false);
    // Should show warning again
    assert.strictEqual(showWarningMessageStub.callCount, 2);
  });

  test("should not show activities warning repeatedly for the same session when limit is hit continuously", async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        activities: [{ name: "activities/1", createTime: "2024-01-01T00:00:00Z" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);

    // First foreground fetch -> shows warning
    await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: true });
    assert.strictEqual(showWarningMessageStub.callCount, 1);

    // Second foreground fetch for SAME session -> no warning
    await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: true });
    assert.strictEqual(showWarningMessageStub.callCount, 1);

    // Foreground fetch for DIFFERENT session -> shows warning
    await fetchSessionActivitiesPaginated("dummyKey", "sessions/test-2", { showPaginationProgress: true });
    assert.strictEqual(showWarningMessageStub.callCount, 2);

    // Now simulate successful fetch without hitting limit for first session
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        activities: [{ name: "activities/1", createTime: "2024-01-01T00:00:00Z" }],
        nextPageToken: undefined,
      }),
    } as any);
    await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: true });

    // Hit limit again for first session -> shows warning
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        activities: [{ name: "activities/1", createTime: "2024-01-01T00:00:00Z" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);
    await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: true });
    assert.strictEqual(showWarningMessageStub.callCount, 3);
  });

  test("should clear activity warning suppression when state is reset", async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        activities: [{ name: "activities/1", createTime: "2024-01-01T00:00:00Z" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);

    await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: true });
    assert.strictEqual(showWarningMessageStub.callCount, 1);

    await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: true });
    assert.strictEqual(showWarningMessageStub.callCount, 1);

    resetPaginationWarningState();

    await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: true });
    assert.strictEqual(showWarningMessageStub.callCount, 2);
  });

  test("should gracefully break activities pagination loop and show warning if showPaginationProgress is true", async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        activities: [{ name: "activities/1", createTime: "2024-01-01T00:00:00Z" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);

    const activities = await fetchSessionActivitiesPaginated("dummyKey", "sessions/test-final", { showPaginationProgress: true });

    assert.strictEqual(activities.length, 2);
    assert.strictEqual(fetchStub.callCount, 2);
    assert.strictEqual(showWarningMessageStub.calledOnce, true);
  });
});
