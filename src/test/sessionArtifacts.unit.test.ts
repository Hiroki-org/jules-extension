/* eslint-disable @typescript-eslint/no-unused-vars */
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fetchUtils from '../fetchUtils';
import {
    extractLatestArtifactsFromActivities,
    updateSessionArtifactsCache,
    fetchLatestSessionArtifacts,
    getCachedSessionArtifacts,
    SessionArtifacts,
    ChangeSetFile,
    ChangeSetSummary,
} from '../sessionArtifacts';

const DEFAULT_API_BASE_URL = "https://jules.googleapis.com/v1alpha";

suite('SessionArtifacts Unit Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        // Stub fetchWithTimeout directly to avoid relying on global.fetch availability/behavior
        fetchStub = sandbox.stub(fetchUtils, 'fetchWithTimeout');
        // Clear cache before each test
        // Note: artifactsCache is not exported to clear, so we rely on unique sessionIds or updateTime
    });

    teardown(() => {
        sandbox.restore();
    });

    // =========================================================================
    // Basic Fetching Tests (Updated for Optimization)
    // =========================================================================

    suite('Basic Fetching & Caching', () => {
        const sessionId = 'session-123';
        const apiKey = 'test-api-key';

        test('should fetch activities and return cached artifacts (Optimized Path)', async () => {
            const mockActivities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'diff --git a/file.ts b/file.ts\nindex 000..111 100644\n--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-foo\n+bar' },
                },
            ];

            // Mock success response for optimized fetch
            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.ok(fetchStub.calledOnce, 'Should call API once (optimized path success)');
            const callArgs = fetchStub.firstCall.args;

            // Check that it used the optimized URL
            assert.ok(callArgs[0].includes('pageSize=50'), 'Should use pageSize param');
            assert.ok(callArgs[0].includes('orderBy=create_time%20desc'), 'Should use orderBy param');

            const headers = callArgs[1]?.headers;
            assert.ok(headers);
            assert.strictEqual((headers as Record<string, string>)['X-Goog-Api-Key'], apiKey);

            assert.strictEqual(result.latestDiff, mockActivities[0].gitPatch.diff);
        });

        test('should use cache if updateTime matches', async () => {
            // Pre-populate cache via a fetch
            const updateTime = '2024-01-01T10:00:00Z';
            const mockActivities = [{ gitPatch: { diff: 'diff 1' }, createTime: '2024-01-01T00:00:00Z' }];

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities }),
            } as Response);

            await fetchLatestSessionArtifacts(apiKey, sessionId, undefined, updateTime);
            fetchStub.resetHistory();

            // Call again with same updateTime
            const result = await fetchLatestSessionArtifacts(apiKey, sessionId, undefined, updateTime);

            assert.ok(fetchStub.notCalled, 'Should verify cache usage');
            assert.strictEqual(result.latestDiff, 'diff 1');
        });
    });

    // =========================================================================
    // Optimization Strategy Tests
    // =========================================================================

    suite('Optimization Strategy', () => {
        const sessionId = 'session-opt';
        const apiKey = 'key';

        test('Success: Sorted Descending (Newest -> Oldest) -> Returns Artifacts', async () => {
            // Newest (first) -> Oldest (last)
            const activities = [
                { createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'Newest Diff' } },
                { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Oldest Diff' } },
            ];

            fetchStub.resolves({
                ok: true,
                json: async () => ({ activities }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.ok(fetchStub.calledOnce);
            const url = fetchStub.firstCall.args[0] as string;
            assert.ok(url.includes('orderBy=create_time%20desc'));

            // The code reverses the array before extracting.
            // Reversed: [Oldest, Newest].
            // Extract checks Newest first. Finds 'Newest Diff'.
            assert.strictEqual(result.latestDiff, 'Newest Diff');
        });

        test('Fallback: Sorted Ascending (Oldest -> Newest) -> Falls back to full fetch', async () => {
            // Oldest (first) -> Newest (last) - API ignored sort order
            const activitiesAsc = [
                { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Oldest Diff' } },
                { createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'Newest Diff' } },
            ];

            // Mock full fetch response
            const activitiesFull = [
                 { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Oldest Diff' } },
                 { createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'Newest Diff' } },
                 { createTime: '2024-01-03T10:00:00Z', gitPatch: { diff: 'Latest Full Diff' } },
            ];

            fetchStub.onFirstCall().resolves({
                ok: true,
                json: async () => ({ activities: activitiesAsc }),
            } as Response);

            fetchStub.onSecondCall().resolves({
                ok: true,
                json: async () => ({ activities: activitiesFull }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.ok(fetchStub.calledTwice, 'Should call twice (fallback triggered)');
            const firstUrl = fetchStub.firstCall.args[0] as string;
            const secondUrl = fetchStub.secondCall.args[0] as string;

            assert.ok(firstUrl.includes('orderBy'), 'First call optimized');
            assert.ok(!secondUrl.includes('orderBy'), 'Second call legacy (no params)');

            // Should get artifacts from full fetch
            assert.strictEqual(result.latestDiff, 'Latest Full Diff');
        });

        test('Fallback: No Artifacts in Window -> Falls back to full fetch', async () => {
            // Descending sort, but no artifacts in window
            const activitiesNoArtifacts = [
                { createTime: '2024-01-02T10:00:00Z' }, // comment
                { createTime: '2024-01-01T10:00:00Z' }, // comment
            ];

            // Full fetch has artifact
            const activitiesFull = [
                { createTime: '2023-12-31T10:00:00Z', gitPatch: { diff: 'Old Artifact' } }, // Old artifact
                { createTime: '2024-01-01T10:00:00Z' },
                { createTime: '2024-01-02T10:00:00Z' },
            ];

            fetchStub.onFirstCall().resolves({
                ok: true,
                json: async () => ({ activities: activitiesNoArtifacts }),
            } as Response);

            fetchStub.onSecondCall().resolves({
                ok: true,
                json: async () => ({ activities: activitiesFull }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.ok(fetchStub.calledTwice);
            assert.strictEqual(result.latestDiff, 'Old Artifact');
        });

        test('Fallback: Optimization Error (400) -> Falls back to full fetch', async () => {
             fetchStub.onFirstCall().resolves({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
            } as Response);

            const activitiesFull = [
                { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Full Diff' } },
            ];

            fetchStub.onSecondCall().resolves({
                ok: true,
                json: async () => ({ activities: activitiesFull }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.ok(fetchStub.calledTwice);
            assert.strictEqual(result.latestDiff, 'Full Diff');
        });
    });

    // =========================================================================
    // Edge Cases & Error Handling (Preserved from original)
    // =========================================================================

    suite('Edge Cases & Error Handling', () => {
        test('can extract files from nested structures', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    {
                                        path: 'deeply/nested/path/file.ts',
                                        status: 'modified',
                                    },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'deeply/nested/path/file.ts');
        });

        // ... preserving key logic tests ...

        test('handles long paths', () => {
             const longPath = 'a/'.repeat(100) + 'file.ts';
             const activities = [{ artifacts: [{ changeSet: { files: [longPath] } }] }];
             const result = extractLatestArtifactsFromActivities(activities as any);
             assert.strictEqual(result.latestChangeSet?.files[0].path, longPath);
        });
    });
});
