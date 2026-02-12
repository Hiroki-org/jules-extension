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

            const result = await fetchLatestSessionArtifacts(apiKey, 'session-' + Math.random().toString(36).substring(7));

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

            const randomSession = 'session-cache-test'; 'session-' + Math.random().toString(36).substring(7);

            fetchStub.resetHistory();

            // Call again with same updateTime
            const result = await fetchLatestSessionArtifacts(apiKey, randomSession, undefined, updateTime);


            assert.ok(fetchStub.notCalled, 'Should verify cache usage');
            assert.strictEqual(result.latestDiff, 'diff 1');
        });
    });

    // =========================================================================
    // Optimization Strategy Tests (Updated for Robustness)
    // =========================================================================

    suite('Optimization Strategy', () => {
        let sessionId = 'session-opt';
        const apiKey = 'key';

        sessionId = 'session-opt-1';
        test('Success: Sorted Descending -> Returns Artifacts', async () => {
            const activities = [
                { createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'Newest Diff' } },
                { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Oldest Diff' } },
            ];

            fetchStub.resolves({
                ok: true,
                json: async () => ({ activities }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, 'session-' + Math.random().toString(36).substring(7));

            assert.ok(fetchStub.calledOnce);
            const url = fetchStub.firstCall.args[0] as string;
            assert.ok(url.includes('orderBy=create_time%20desc'));
            assert.strictEqual(result.latestDiff, 'Newest Diff');
        });

        sessionId = 'session-opt-2';
        test('Fallback: Sorted Ascending -> Falls back to full fetch', async () => {
            const activitiesAsc = [
                { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Oldest Diff' } },
                { createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'Newest Diff' } },
            ];

            const activitiesFull: any[] = [
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

            const result = await fetchLatestSessionArtifacts(apiKey, 'session-' + Math.random().toString(36).substring(7));

            assert.ok(fetchStub.calledTwice, 'Should call twice (fallback triggered)');
            assert.strictEqual(result.latestDiff, 'Latest Full Diff');
        });

        sessionId = 'session-opt-3';
        test('Fallback: Missing Required Artifact in Top 50 -> Falls back', async () => {
            // Newest activity has Diff, but we also want Changeset (default)
            // Top 50 has Diff, but NO changeset.
            const activitiesPartial = [
                { createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'New Diff' } }
            ];
            // Simulate 50 items so historyExhausted is false (Descending: Newest -> Oldest)
            while(activitiesPartial.length < 50) {
                 activitiesPartial.push({ createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Old' } });
            }

            // Full history (Ascending: Oldest -> Newest)
            // Contains 'Another Diff' (Oldest) and 'New Diff' (Newest)
            // Also contains the missing Changeset (Oldest)
            const activitiesFull: any[] = [
                {
                    createTime: '2023-01-01T10:00:00Z',
                    gitPatch: { diff: 'Another Diff' },
                    artifacts: [{ changeSet: { files: [{ path: 'foo.ts' }] } }]
                }
            ];
            // Add filler
            for(let i=0; i<49; i++) {
                activitiesFull.push({ createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Old' } });
            }
            // Add Newest
            activitiesFull.push({ createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'New Diff' } });


            fetchStub.onFirstCall().resolves({
                ok: true,
                json: async () => ({ activities: activitiesPartial }),
            } as Response);

            fetchStub.onSecondCall().resolves({
                ok: true,
                json: async () => ({ activities: activitiesFull }),
            } as Response);

            // Default requiredArtifacts = ['diff', 'changeset']
            const result = await fetchLatestSessionArtifacts(apiKey, 'session-' + Math.random().toString(36).substring(7));

            assert.ok(fetchStub.calledTwice, 'Should fallback because ChangeSet was missing');
            // After fallback, we process activitiesFull (Ascending).
            // Newest is at the end. So we find 'New Diff'.
            assert.strictEqual(result.latestDiff, 'New Diff');
            assert.ok(result.latestChangeSet, 'Should eventually find changeset from full fetch');
        });

        sessionId = 'session-opt-4';
        test('Success: Missing Required Artifact but History Exhausted -> Returns Partial', async () => {
            // Only 1 activity total. Has Diff, no ChangeSet.
            const activities = [
                { createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'Only Diff' } }
            ];

            fetchStub.resolves({
                ok: true,
                json: async () => ({ activities }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, 'session-' + Math.random().toString(36).substring(7));

            assert.ok(fetchStub.calledOnce, 'Should NOT fallback because history is exhausted');
            assert.strictEqual(result.latestDiff, 'Only Diff');
            assert.strictEqual(result.latestChangeSet, undefined);
        });

        sessionId = 'session-opt-5';
        test('Success: Missing Unneeded Artifact -> Returns Partial', async () => {
            // We only need 'diff'. Top 50 has diff. No changeset.
            const activitiesPartial = [
                { createTime: '2024-01-02T10:00:00Z', gitPatch: { diff: 'New Diff' } }
            ];
             while(activitiesPartial.length < 50) {
                 activitiesPartial.push({ createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'Old' } });
            }

            fetchStub.resolves({
                ok: true,
                json: async () => ({ activities: activitiesPartial }),
            } as Response);

            // Only request 'diff'
            const result = await fetchLatestSessionArtifacts(apiKey, 'session-' + Math.random().toString(36).substring(7), undefined, undefined, ['diff']);

            assert.ok(fetchStub.calledOnce, 'Should return early because we found required diff');
            assert.strictEqual(result.latestDiff, 'New Diff');
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

        test('handles long paths', () => {
             const longPath = 'a/'.repeat(100) + 'file.ts';
             const activities = [{ artifacts: [{ changeSet: { files: [longPath] } }] }];
             const result = extractLatestArtifactsFromActivities(activities as any);
             assert.strictEqual(result.latestChangeSet?.files[0].path, longPath);
        });
    });
});
