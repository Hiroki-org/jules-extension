import * as assert from "assert";
import * as vscode from "vscode";
import * as sinon from "sinon";
import * as fetchUtils from "../fetchUtils";
import {
  fetchSessionActivitiesPaginated,
  JulesSessionsProvider
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
      globalState: { get: () => "dummyKey" },
      secrets: { get: async () => "dummyApiKey" },
    } as any;
    const provider = new JulesSessionsProvider(mockContext);
      localSandbox.stub(provider as any, "_prefetchArtifactsForRecentSessions").resolves();

    while (provider['isFetching']) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    fetchStub.resetHistory();
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
      globalState: { get: () => "dummyKey" },
      secrets: { get: async () => "dummyApiKey" },
    } as any;
    const provider = new JulesSessionsProvider(mockContext);
      localSandbox.stub(provider as any, "_prefetchArtifactsForRecentSessions").resolves();

    while (provider['isFetching']) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    fetchStub.resetHistory();
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

  test("should gracefully break activities pagination loop and show warning if showPaginationProgress is true", async () => {
    fetchStub.resolves({
      ok: true,
      json: async () => ({
        activities: [{ name: "activities/1", createTime: "2024-01-01T00:00:00Z" }],
        nextPageToken: "always-more-tokens",
      }),
    } as any);

    const activities = await fetchSessionActivitiesPaginated("dummyKey", "sessions/test", { showPaginationProgress: true });

    assert.strictEqual(activities.length, 2);
    assert.strictEqual(fetchStub.callCount, 2);
    assert.strictEqual(showWarningMessageStub.calledOnce, true);
  });
});
