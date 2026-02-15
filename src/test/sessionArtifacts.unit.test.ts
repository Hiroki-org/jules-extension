/* eslint-disable @typescript-eslint/no-unused-vars */
import * as assert from 'assert';
import * as sinon from 'sinon';
import {
    extractLatestArtifactsFromActivities,
    updateSessionArtifactsCache,
    fetchLatestSessionArtifacts,
    getCachedSessionArtifacts,
    SessionArtifacts,
    ChangeSetFile,
    ChangeSetSummary,
} from '../sessionArtifacts';

suite('SessionArtifacts ユニットテスト', () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        fetchStub = sandbox.stub(global, 'fetch');
    });

    teardown(() => {
        sandbox.restore();
    });

    // =========================================================================
    // extractLatestArtifactsFromActivities のテスト
    // =========================================================================

    suite('extractLatestArtifactsFromActivities', () => {
        test('空の配列を渡した場合、空のオブジェクトを返すこと', () => {
            const result = extractLatestArtifactsFromActivities([]);
            assert.deepStrictEqual(result, {});
        });

        test('null や undefined を渡した場合でもエラーにならないこと', () => {
            const result1 = extractLatestArtifactsFromActivities(null as any);
            assert.deepStrictEqual(result1, {});

            const result2 = extractLatestArtifactsFromActivities(undefined as any);
            assert.deepStrictEqual(result2, {});
        });

        test('gitPatch.diff から最新の diff を抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: {
                        diff: 'diff --git a/file1.ts b/file1.ts\n--- a/file1.ts\n+++ b/file1.ts',
                    },
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestDiff);
            assert.strictEqual(result.latestDiff, activities[0].gitPatch!.diff);
        });

        test('artifacts.changeSet.gitPatch.unidiffPatch から diff を抽出すること', () => {
            const unidiff = 'diff --git a/file2.ts b/file2.ts\n--- a/file2.ts\n+++ b/file2.ts';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                gitPatch: {
                                    unidiffPatch: unidiff,
                                },
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestDiff);
            assert.strictEqual(result.latestDiff, unidiff);
        });

        test('複数のアクティビティがある場合、最新の diff を返すこと', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'old diff' },
                },
                {
                    createTime: '2024-01-02T00:00:00Z',
                    gitPatch: { diff: 'newer diff' },
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.strictEqual(result.latestDiff, 'newer diff');
        });

        test('空の diff 文字列は無視されること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: '   ' },
                },
                {
                    createTime: '2024-01-02T00:00:00Z',
                    gitPatch: { diff: 'valid diff' },
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.strictEqual(result.latestDiff, 'valid diff');
        });

        test('changeSet から files を抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: 'src/file1.ts', status: 'modified' },
                                    { path: 'src/file2.ts', status: 'added' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 2);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
            assert.strictEqual(result.latestChangeSet.files[0].status, 'modified');
            assert.strictEqual(result.latestChangeSet.files[1].path, 'src/file2.ts');
            assert.strictEqual(result.latestChangeSet.files[1].status, 'added');
        });

        test('changeSet.files が存在しない場合、changes から抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                changes: [
                                    { path: 'src/file1.ts', status: 'modified' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 1);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
        });

        test('changeSet.entries から抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                entries: [
                                    { path: 'src/file1.ts', status: 'modified' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 1);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
        });

        test('changeSet.changedFiles から抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                changedFiles: [
                                    { path: 'src/file1.ts', status: 'modified' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 1);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
        });

        test('changeSet.paths から抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                paths: [
                                    { path: 'src/file1.ts', status: 'modified' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 1);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
        });

        test('文字列配列からファイルパスを抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: ['src/file1.ts', 'src/file2.ts'],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 2);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
            assert.strictEqual(result.latestChangeSet.files[1].path, 'src/file2.ts');
        });

        test('path 以外の代替フィールド名（filePath, file, name, filename）からパスを抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { filePath: 'src/file1.ts' },
                                    { file: 'src/file2.ts' },
                                    { name: 'src/file3.ts' },
                                    { filename: 'src/file4.ts' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 4);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
            assert.strictEqual(result.latestChangeSet.files[1].path, 'src/file2.ts');
            assert.strictEqual(result.latestChangeSet.files[2].path, 'src/file3.ts');
            assert.strictEqual(result.latestChangeSet.files[3].path, 'src/file4.ts');
        });

        test('status 以外の代替フィールド名（action, type）からステータスを抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: 'src/file1.ts', status: 'modified' },
                                    { path: 'src/file2.ts', action: 'added' },
                                    { path: 'src/file3.ts', type: 'deleted' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files[0].status, 'modified');
            assert.strictEqual(result.latestChangeSet.files[1].status, 'added');
            assert.strictEqual(result.latestChangeSet.files[2].status, 'deleted');
        });

        test('先頭のスラッシュを削除すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: ['/src/file1.ts', '/src/file2.ts'],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
            assert.strictEqual(result.latestChangeSet.files[1].path, 'src/file2.ts');
        });

        test('重複したパスを除外すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: 'src/file1.ts', status: 'modified' },
                                    { path: 'src/file1.ts', status: 'added' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 1);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
        });

        test('空文字列やホワイトスペースのみのパスを無視すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: '', status: 'modified' },
                                    { path: '   ', status: 'added' },
                                    { path: 'src/file1.ts', status: 'modified' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 1);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
        });

        test('changeSet が見つからない場合、フォールバックで diff から抽出すること', () => {
            const diff = 'diff --git a/src/file1.ts b/src/file1.ts\n' +
                'diff --git a/src/file2.ts b/src/file2.ts\n';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff },
                    artifacts: [
                        {
                            changeSet: {},
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 2);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'src/file1.ts');
            assert.strictEqual(result.latestChangeSet.files[1].path, 'src/file2.ts');
        });

        test('diff から複数のファイルを抽出すること', () => {
            const diff = `diff --git a/src/file1.ts b/src/file1.ts
index 1234567..abcdefg 100644
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,3 +1,3 @@
diff --git a/src/file2.ts b/src/file2.ts
index 2345678..bcdefgh 100644
--- a/src/file2.ts
+++ b/src/file2.ts`;

            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff },
                    artifacts: [
                        {
                            changeSet: {},
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 2);
        });

        test('無効な形式の diff を処理すること', () => {
            const diff = 'invalid diff format';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff },
                    artifacts: [
                        {
                            changeSet: {},
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 0);
        });

        test('複数の artifacts から最新の changeSet を抽出すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [{ path: 'old/file.ts' }],
                            },
                        },
                    ],
                },
                {
                    createTime: '2024-01-02T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [{ path: 'new/file.ts' }],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'new/file.ts');
        });
    });

    // =========================================================================
    // updateSessionArtifactsCache のテスト
    // =========================================================================

    suite('updateSessionArtifactsCache', () => {
        test('キャッシュが空の場合、新しいエントリを追加し true を返すこと', () => {
            const sessionId = 'session-001';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'test diff' },
                },
            ];

            const updated = updateSessionArtifactsCache(sessionId, activities);
            assert.strictEqual(updated, true);

            const cached = getCachedSessionArtifacts(sessionId);
            assert.ok(cached);
            assert.strictEqual(cached.latestDiff, 'test diff');
        });

        test('diff が変更されていない場合、false を返すこと', () => {
            const sessionId = 'session-002';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'test diff' },
                },
            ];

            updateSessionArtifactsCache(sessionId, activities);
            const updated = updateSessionArtifactsCache(sessionId, activities);

            assert.strictEqual(updated, false);
        });

        test('diff が変更された場合、true を返すこと', () => {
            const sessionId = 'session-003';
            const activities1 = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'old diff' },
                },
            ];
            const activities2 = [
                {
                    createTime: '2024-01-02T00:00:00Z',
                    gitPatch: { diff: 'new diff' },
                },
            ];

            updateSessionArtifactsCache(sessionId, activities1);
            const updated = updateSessionArtifactsCache(sessionId, activities2);

            assert.strictEqual(updated, true);
        });

        test('changeSet が変更された場合、true を返すこと', () => {
            const sessionId = 'session-004';
            const activities1 = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [{ path: 'file1.ts' }],
                            },
                        },
                    ],
                },
            ];
            const activities2 = [
                {
                    createTime: '2024-01-02T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [{ path: 'file2.ts' }],
                            },
                        },
                    ],
                },
            ];

            updateSessionArtifactsCache(sessionId, activities1);
            const updated = updateSessionArtifactsCache(sessionId, activities2);

            assert.strictEqual(updated, true);
        });

        test('changeSet のファイル順序が異なっても同じとみなすこと', () => {
            const sessionId = 'session-005';
            const activities1 = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: 'file1.ts', status: 'modified' },
                                    { path: 'file2.ts', status: 'added' },
                                ],
                            },
                        },
                    ],
                },
            ];
            const activities2 = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: 'file2.ts', status: 'added' },
                                    { path: 'file1.ts', status: 'modified' },
                                ],
                            },
                        },
                    ],
                },
            ];

            updateSessionArtifactsCache(sessionId, activities1);
            const updated = updateSessionArtifactsCache(sessionId, activities2);

            assert.strictEqual(updated, false);
        });

        test('changeSet のファイル数が異なる場合、true を返すこと', () => {
            const sessionId = 'session-006';
            const activities1 = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [{ path: 'file1.ts' }],
                            },
                        },
                    ],
                },
            ];
            const activities2 = [
                {
                    createTime: '2024-01-02T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: 'file1.ts' },
                                    { path: 'file2.ts' },
                                ],
                            },
                        },
                    ],
                },
            ];

            updateSessionArtifactsCache(sessionId, activities1);
            const updated = updateSessionArtifactsCache(sessionId, activities2);

            assert.strictEqual(updated, true);
        });

        test('changeSet のステータスが異なる場合、true を返すこと', () => {
            const sessionId = 'session-007';
            const activities1 = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [{ path: 'file1.ts', status: 'modified' }],
                            },
                        },
                    ],
                },
            ];
            const activities2 = [
                {
                    createTime: '2024-01-02T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [{ path: 'file1.ts', status: 'added' }],
                            },
                        },
                    ],
                },
            ];

            updateSessionArtifactsCache(sessionId, activities1);
            const updated = updateSessionArtifactsCache(sessionId, activities2);

            assert.strictEqual(updated, true);
        });
    });

    // =========================================================================
    // getCachedSessionArtifacts のテスト
    // =========================================================================

    suite('getCachedSessionArtifacts', () => {
        test('存在しないセッション ID の場合、undefined を返すこと', () => {
            const cached = getCachedSessionArtifacts('non-existent-session');
            assert.strictEqual(cached, undefined);
        });

        test('キャッシュされたセッションの場合、正しい値を返すこと', () => {
            const sessionId = 'session-100';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'cached diff' },
                },
            ];

            updateSessionArtifactsCache(sessionId, activities);
            const cached = getCachedSessionArtifacts(sessionId);

            assert.ok(cached);
            assert.strictEqual(cached.latestDiff, 'cached diff');
        });
    });

    // =========================================================================
    // fetchLatestSessionArtifacts のテスト
    // =========================================================================

    suite('fetchLatestSessionArtifacts', () => {
        test('API からアクティビティを取得し、キャッシュに保存すること', async () => {
            const sessionId = 'session-200';
            const apiKey = 'test-api-key';
            const mockActivities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'fetched diff' },
                },
            ];

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.ok(result.latestDiff);
            assert.strictEqual(result.latestDiff, 'fetched diff');

            const cached = getCachedSessionArtifacts(sessionId);
            assert.ok(cached);
            assert.strictEqual(cached.latestDiff, 'fetched diff');
        });

        test('API が失敗した場合、エラーをスローすること', async () => {
            const sessionId = 'session-201';
            const apiKey = 'test-api-key';

            fetchStub.resolves({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            } as Response);

            await assert.rejects(
                async () => await fetchLatestSessionArtifacts(apiKey, sessionId),
                /Failed to fetch activities: 404 Not Found/
            );
        });

        test('API が不正なレスポンスを返した場合、エラーをスローすること', async () => {
            const sessionId = 'session-202';
            const apiKey = 'test-api-key';

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({}),
            } as Response);

            await assert.rejects(
                async () => await fetchLatestSessionArtifacts(apiKey, sessionId),
                /Invalid response format from API/
            );
        });

        test('API が activities 配列以外を返した場合、エラーをスローすること', async () => {
            const sessionId = 'session-203';
            const apiKey = 'test-api-key';

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: 'not an array' }),
            } as Response);

            await assert.rejects(
                async () => await fetchLatestSessionArtifacts(apiKey, sessionId),
                /Invalid response format from API/
            );
        });

        test('カスタム API ベース URL を使用できること', async () => {
            const sessionId = 'session-204';
            const apiKey = 'test-api-key';
            const customBaseUrl = 'https://custom.api.example.com/v1';
            const mockActivities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'custom api diff' },
                },
            ];

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities }),
            } as Response);

            await fetchLatestSessionArtifacts(apiKey, sessionId, customBaseUrl);

            assert.ok(fetchStub.calledOnce);
            const callArgs = fetchStub.firstCall.args;
            assert.ok(callArgs[0].startsWith(customBaseUrl));
        });

        test('API キーがヘッダーに正しく設定されること', async () => {
            const sessionId = 'session-205';
            const apiKey = 'test-api-key-12345';
            const mockActivities = [
                {
                    createTime: '2024-01-01T00:00:00Z', gitPatch: { diff: 'dummy' },
                },
            ];

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities }),
            } as Response);

            await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.ok(fetchStub.calledOnce);
            const callArgs = fetchStub.firstCall.args;
            const headers = callArgs[1]?.headers;
            assert.ok(headers);
            assert.strictEqual((headers as Record<string, string>)['X-Goog-Api-Key'], apiKey);
        });
    });

    // =========================================================================
    // エッジケースとエラーハンドリングのテスト
    // =========================================================================

    suite('エッジケースとエラーハンドリング', () => {
        test('ネストされた複雑な構造からもファイルを抽出できること', () => {
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

        test('非常に長いファイルパスを処理できること', () => {
            const longPath = 'a/'.repeat(100) + 'file.ts';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [longPath],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files[0].path, longPath);
        });

        test('特殊文字を含むファイルパスを処理できること', () => {
            const specialPath = 'src/file-with-special_chars@#$.ts';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [specialPath],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files[0].path, specialPath);
        });

        test('Unicode 文字を含むファイルパスを処理できること', () => {
            const unicodePath = 'src/ファイル.ts';
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [unicodePath],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files[0].path, unicodePath);
        });

        test('数値型のプロパティを無視すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: 123 as any },
                                    { path: 'valid-file.ts' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 1);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'valid-file.ts');
        });

        test('null や undefined のプロパティを無視すること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: {
                                files: [
                                    { path: null as any },
                                    { path: undefined as any },
                                    { path: 'valid-file.ts' },
                                ],
                            },
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestChangeSet);
            assert.strictEqual(result.latestChangeSet.files.length, 1);
            assert.strictEqual(result.latestChangeSet.files[0].path, 'valid-file.ts');
        });

        test('空の artifacts 配列を処理できること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.deepStrictEqual(result, { latestDiff: undefined, latestChangeSet: undefined });
        });

        test('artifacts が undefined の場合を処理できること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.deepStrictEqual(result, { latestDiff: undefined, latestChangeSet: undefined });
        });

        test('changeSet が null の場合を処理できること', () => {
            const activities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    artifacts: [
                        {
                            changeSet: null as any,
                        },
                    ],
                },
            ];

            const result = extractLatestArtifactsFromActivities(activities);
            assert.deepStrictEqual(result, { latestDiff: undefined, latestChangeSet: undefined });
        });

        test('大量のアクティビティを効率的に処理できること', () => {
            const activities = Array.from({ length: 1000 }, (_, i) => ({
                createTime: `2024-01-01T00:${String(i).padStart(2, '0')}:00Z`,
                gitPatch: { diff: `diff ${i}` },
            }));

            const result = extractLatestArtifactsFromActivities(activities);
            assert.ok(result.latestDiff);
            assert.strictEqual(result.latestDiff, 'diff 999');
        });
    });

    // =========================================================================
    // Performance Optimization Tests
    // =========================================================================

    suite('Performance Optimization', () => {
        test('updateTimeが一致する場合、ネットワーク呼び出しをスキップしてキャッシュを返すこと', async () => {
            const sessionId = 'session-perf-1';
            const apiKey = 'test-api-key';
            const updateTime = '2024-01-01T12:00:00Z';

            // Initial fetch to populate cache
            const mockActivities = [
                {
                    createTime: '2024-01-01T00:00:00Z',
                    gitPatch: { diff: 'diff 1' },
                },
            ];

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities }),
            } as Response);

            // First call - should fetch
            await fetchLatestSessionArtifacts(apiKey, sessionId, undefined, updateTime);
            assert.ok(fetchStub.calledOnce, 'First call should fetch');

            fetchStub.resetHistory();

            // Second call with same updateTime - should NOT fetch
            const result = await fetchLatestSessionArtifacts(apiKey, sessionId, undefined, updateTime);
            assert.ok(fetchStub.notCalled, 'Second call should use cache');
            assert.strictEqual(result.latestDiff, 'diff 1');
        });

        test('updateTimeが異なる場合、ネットワーク呼び出しを行うこと', async () => {
            const sessionId = 'session-perf-2';
            const apiKey = 'test-api-key';
            const updateTime1 = '2024-01-01T12:00:00Z';
            const updateTime2 = '2024-01-01T13:00:00Z';

            // Initial fetch
            const mockActivities1 = [{ gitPatch: { diff: 'diff 1' } }];
            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities1 }),
            } as Response);

            await fetchLatestSessionArtifacts(apiKey, sessionId, undefined, updateTime1);
            assert.ok(fetchStub.calledOnce);

            fetchStub.resetHistory();

            // Second call with different updateTime - should fetch
            const mockActivities2 = [{ gitPatch: { diff: 'diff 2' } }];
            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities2 }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId, undefined, updateTime2);
            assert.ok(fetchStub.calledOnce, 'Should fetch when updateTime changes');
            assert.strictEqual(result.latestDiff, 'diff 2');
        });
    });

    // =========================================================================
    // Optimized Fetch Strategy Tests
    // =========================================================================

    suite('Performance Optimization (Fetch Strategy)', () => {
        const DEFAULT_API_BASE_URL = "https://jules.googleapis.com/v1alpha";

        test('最適化フェッチが成功（降順）した場合、フォールバックせずに返却すること', async () => {
            const sessionId = 'session-opt-success';
            const apiKey = 'test-api-key';

            // 降順（最新が先頭）のレスポンス
            const mockActivities = [
                { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'latest diff' } },
                { createTime: '2024-01-01T09:00:00Z' }
            ];

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockActivities }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.strictEqual(result.latestDiff, 'latest diff');
            assert.ok(fetchStub.calledOnce, '最適化フェッチ成功時は1回のみ呼び出されるべき');

            const callArgs = fetchStub.firstCall.args;
            const url = callArgs[0] as string;
            assert.ok(url.includes('orderBy=create_time+desc'));
            assert.ok(url.includes('pageSize=50'));
        });

        test('最適化フェッチが昇順（古い順）で返ってきた場合、フォールバックすること', async () => {
            const sessionId = 'session-opt-fallback-asc';
            const apiKey = 'test-api-key';

            // 1回目: 昇順（古い順）
            const mockAscending = [
                { createTime: '2024-01-01T09:00:00Z' },
                { createTime: '2024-01-01T10:00:00Z' }
            ];
            // 2回目: 全件（新しい順に並んでいるか関係なく、ここから抽出される）
            const mockAll = [
                { createTime: '2024-01-01T09:00:00Z' },
                { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'fallback diff' } }
            ];

            fetchStub.onFirstCall().resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockAscending }),
            } as Response);

            fetchStub.onSecondCall().resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockAll }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.strictEqual(result.latestDiff, 'fallback diff');
            assert.ok(fetchStub.calledTwice, '昇順レスポンス時はフォールバックすべき');

            const call2Args = fetchStub.secondCall.args;
            const url2 = call2Args[0] as string;
            assert.strictEqual(url2, `${DEFAULT_API_BASE_URL}/${sessionId}/activities`);
        });

        test('最適化フェッチでアーティファクトが見つからない場合、フォールバックすること', async () => {
            const sessionId = 'session-opt-fallback-empty';
            const apiKey = 'test-api-key';

            // 1回目: 降順だがアーティファクトなし
            const mockNoArtifacts = [
                { createTime: '2024-01-01T10:00:00Z' },
                { createTime: '2024-01-01T09:00:00Z' }
            ];
            // 2回目: 全件（古い履歴にアーティファクトあり）
            const mockAll = [
                { createTime: '2024-01-01T08:00:00Z', gitPatch: { diff: 'old diff' } }, // Oldest
                { createTime: '2024-01-01T09:00:00Z' },
                { createTime: '2024-01-01T10:00:00Z' }
            ];

            fetchStub.onFirstCall().resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockNoArtifacts }),
            } as Response);

            fetchStub.onSecondCall().resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockAll }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.strictEqual(result.latestDiff, 'old diff');
            assert.ok(fetchStub.calledTwice, 'アーティファクトが見つからない場合はフォールバックすべき');
        });

        test('最適化フェッチがエラーの場合、フォールバックすること', async () => {
            const sessionId = 'session-opt-fallback-error';
            const apiKey = 'test-api-key';

            fetchStub.onFirstCall().resolves({
                ok: false,
                status: 400,
                statusText: 'Bad Request'
            } as Response);

            const mockAll = [
                { createTime: '2024-01-01T10:00:00Z', gitPatch: { diff: 'success diff' } }
            ];

            fetchStub.onSecondCall().resolves({
                ok: true,
                status: 200,
                json: async () => ({ activities: mockAll }),
            } as Response);

            const result = await fetchLatestSessionArtifacts(apiKey, sessionId);

            assert.strictEqual(result.latestDiff, 'success diff');
            assert.ok(fetchStub.calledTwice, 'エラー時はフォールバックすべき');
        });
    });
});
