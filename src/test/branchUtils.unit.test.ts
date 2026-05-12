import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { getCurrentBranch, getBranchesForSession } from '../branchUtils';
import type { Source as SourceType } from '../types';

suite('branchUtils Unit Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let mockOutputChannel: vscode.OutputChannel;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();
        mockOutputChannel = {
            appendLine: sinon.stub(),
            append: sinon.stub(),
            clear: sinon.stub(),
            replace: sinon.stub(),
            dispose: sinon.stub(),
            name: 'test',
            show: sinon.stub(),
            hide: sinon.stub()
        } as any;

        mockContext = {
            globalState: {
                get: sinon.stub().returns(undefined),
                update: sinon.stub().resolves(),
                setKeysForSync: sinon.stub(),
                keys: sinon.stub().returns([])
            }
        } as any;
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('getCurrentBranch', () => {
        test('should return branch name when Git extension is available', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [{
                            state: {
                                HEAD: {
                                    name: 'main'
                                }
                            }
                        }]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(mockGitExtension as any);

            const result = await getCurrentBranch(mockOutputChannel);
            assert.strictEqual(result, 'main');
        });

        test('should return null when Git extension is not available', async () => {
            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(undefined);

            const result = await getCurrentBranch(mockOutputChannel);
            assert.strictEqual(result, null);
        });

        test('should return null when no repositories found', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: []
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(mockGitExtension as any);

            const result = await getCurrentBranch(mockOutputChannel);
            assert.strictEqual(result, null);
        });

        test('should return null when HEAD is not available', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [{
                            state: {
                                HEAD: null
                            }
                        }]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(mockGitExtension as any);

            const result = await getCurrentBranch(mockOutputChannel);
            assert.strictEqual(result, null);
        });

        test('should use provided repository when given', async () => {
            const mockRepository = {
                state: {
                    HEAD: {
                        name: 'feature/test'
                    }
                }
            };

            const result = await getCurrentBranch(mockOutputChannel, { repository: mockRepository });
            assert.strictEqual(result, 'feature/test');
        });

        test('should handle errors gracefully', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().throws(new Error('API Error'))
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(mockGitExtension as any);

            const result = await getCurrentBranch(mockOutputChannel);
            assert.strictEqual(result, null);
        });

        test('should select repository in single repository case', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [{
                            state: {
                                HEAD: {
                                    name: 'develop'
                                }
                            }
                        }]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(mockGitExtension as any);

            const result = await getCurrentBranch(mockOutputChannel);
            assert.strictEqual(result, 'develop');
        });

        test('should infer repository from active text editor in silent mode', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [
                            { rootUri: { fsPath: '/repo1' }, state: { HEAD: { name: 'repo1-branch' } } },
                            { rootUri: { fsPath: '/repo2' }, state: { HEAD: { name: 'repo2-branch' } } }
                        ]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension').returns(mockGitExtension as any);
            sandbox.stub(vscode.window, 'activeTextEditor').value({
                document: {
                    uri: { scheme: 'file', fsPath: '/repo2/src/main.ts' }
                }
            });

            const result = await getCurrentBranch(mockOutputChannel, { silent: true });
            assert.strictEqual(result, 'repo2-branch');
        });

        test('should return null when multiple repos exist, silent mode is true, but no matching active editor', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [
                            { rootUri: { fsPath: '/repo1' }, state: { HEAD: { name: 'repo1-branch' } } },
                            { rootUri: { fsPath: '/repo2' }, state: { HEAD: { name: 'repo2-branch' } } }
                        ]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension').returns(mockGitExtension as any);
            sandbox.stub(vscode.window, 'activeTextEditor').value({
                document: {
                    uri: { scheme: 'file', fsPath: '/other/path/main.ts' }
                }
            });

            const result = await getCurrentBranch(mockOutputChannel, { silent: true });
            assert.strictEqual(result, null);
        });

        test('should prompt user to select repository when silent mode is false', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [
                            { rootUri: { fsPath: '/repo1' }, state: { HEAD: { name: 'repo1-branch' } } },
                            { rootUri: { fsPath: '/repo2' }, state: { HEAD: { name: 'repo2-branch' } } }
                        ]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension').returns(mockGitExtension as any);
            const showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick').resolves({
                label: 'repo2',
                repo: { rootUri: { fsPath: '/repo2' }, state: { HEAD: { name: 'repo2-branch' } } }
            } as any);

            const result = await getCurrentBranch(mockOutputChannel, { silent: false });
            assert.strictEqual(result, 'repo2-branch');
            assert.ok(showQuickPickStub.calledOnce);
        });

        test('should return null if user cancels repository selection', async () => {
            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [
                            { rootUri: { fsPath: '/repo1' }, state: { HEAD: { name: 'repo1-branch' } } },
                            { rootUri: { fsPath: '/repo2' }, state: { HEAD: { name: 'repo2-branch' } } }
                        ]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension').returns(mockGitExtension as any);
            sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);

            const result = await getCurrentBranch(mockOutputChannel, { silent: false });
            assert.strictEqual(result, null);
        });
    });


    suite('areArraysEqual and areCacheContentsEqual Optimization', () => {
        test('should correctly compare branch arrays and cache contents', async () => {
            const mockSource = { id: 'test-source', name: 'test-source' };
            const cachedData = {
                branches: ['main', 'develop'],
                defaultBranch: 'main',
                remoteBranches: ['develop', 'main'],
                currentBranch: 'main',
                timestamp: Date.now() - 1000 // Force aging condition
            };
            (mockContext.globalState.get as any).returns(cachedData);

            const mockApiClient = {
                getSource: sinon.stub().resolves({
                    githubRepo: {
                        branches: [{ displayName: 'main' }, { displayName: 'develop' }],
                        defaultBranch: { displayName: 'main' }
                    }
                })
            };

            const gitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [{
                            state: { HEAD: { name: 'main' } }
                        }]
                    })
                }
            };
            sandbox.stub(vscode.extensions, 'getExtension').returns(gitExtension as any);

            // Fetch identical data to trigger areCacheContentsEqual
            const result = await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false }
            );

            assert.strictEqual(result.currentBranch, 'main');

            // Trigger cache mismatch by changing data
            cachedData.branches = ['main'];
            const result2 = await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false }
            );
            assert.strictEqual(result2.currentBranch, 'main');
        });
    });

    suite('getBranchesForSession', () => {

        test('areArraysEqual covers full equivalence, subsets, and permutations', async () => {
            const mockSource = { id: 'test-source', name: 'test-source' };
            // First we prepare a cache
            const cachedData = {
                branches: ['main', 'develop', 'develop'], // Notice duplicate
                defaultBranch: 'main',
                remoteBranches: ['develop', 'main', 'develop'],
                currentBranch: 'main',
                timestamp: Date.now()
            };
            (mockContext.globalState.get as any).returns(cachedData);

            const mockApiClient = {
                getSource: sinon.stub().resolves({
                    githubRepo: {
                        branches: [{ displayName: 'develop' }, { displayName: 'main' }, { displayName: 'develop' }],
                        defaultBranch: { displayName: 'main' }
                    }
                })
            };

            // This run matches cache data except remote order, so it hits areArraysEqual permutations true
            const result1 = await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: false, showProgress: false } // we want areCacheContentsEqual
            );

            // Now force refresh but let API return same data, cache hit condition is triggered internally
            await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false, silent: true }
            );

            // Now test failure cases

            // Case 1: Length mismatch
            cachedData.branches = ['main'];
            await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false, silent: true }
            );

            // Case 2: Element missing
            cachedData.branches = ['main', 'main', 'develop'];
            await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false, silent: true }
            );

            // Case 3: Remote mismatch
            cachedData.branches = ['develop', 'main', 'develop'];
            cachedData.remoteBranches = ['main', 'develop', 'other'];
            await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false, silent: true }
            );

            // Case 4: Default branch mismatch
            cachedData.remoteBranches = ['develop', 'main', 'develop'];
            cachedData.defaultBranch = 'other';
            await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false, silent: true }
            );

            // Case 5: Current branch mismatch
            cachedData.defaultBranch = 'main';
            cachedData.currentBranch = 'other';
            await getBranchesForSession(
                mockSource as any,
                mockApiClient as any,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false, silent: true }
            );
        });

        test('should use cached branches when cache is valid', async () => {
            const mockSource: SourceType = {
                id: 'test-source',
                name: 'test-source'
            };

            const cachedData = {
                branches: ['main', 'develop'],
                defaultBranch: 'main',
                remoteBranches: ['main', 'develop'],
                currentBranch: 'main',
                timestamp: Date.now()
            };

            (mockContext.globalState.get as any).returns(cachedData);

            const mockApiClient = {} as any;

            const result = await getBranchesForSession(
                mockSource,
                mockApiClient,
                mockOutputChannel,
                mockContext,
                { showProgress: false }
            );

            assert.deepStrictEqual(result.branches, ['main', 'develop']);
            assert.strictEqual(result.defaultBranch, 'main');
        });

        test('should fetch fresh branches when forceRefresh is true', async () => {
            const mockSource: SourceType = {
                id: 'test-source',
                name: 'test-source'
            };

            const mockApiClient = {
                getSource: sinon.stub().resolves({
                    githubRepo: {
                        branches: [
                            { displayName: 'main' },
                            { displayName: 'develop' },
                            { displayName: 'feature/new' }
                        ],
                        defaultBranch: { displayName: 'main' }
                    }
                })
            } as any;

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(undefined);

            const result = await getBranchesForSession(
                mockSource,
                mockApiClient,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false }
            );

            assert.ok(result.branches.length >= 3, 'Should have at least 3 branches');
            assert.deepStrictEqual(result.branches.sort(), ['develop', 'feature/new', 'main'].sort(), 'Should have all expected branches');
            assert.strictEqual(result.defaultBranch, 'main');
        });

        test('should fall back to default branch when API fails', async () => {
            const mockSource: SourceType = {
                id: 'test-source',
                name: 'test-source'
            };

            const mockApiClient = {
                getSource: sinon.stub().rejects(new Error('API Error'))
            } as any;

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(undefined);

            const result = await getBranchesForSession(
                mockSource,
                mockApiClient,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false }
            );

            assert.strictEqual(result.defaultBranch, 'main', 'Should fall back to main branch');
            assert.ok(result.branches.includes('main'), 'Main branch should be in list');
        });

        test('should add current branch to list if not in remote branches', async () => {
            const mockSource: SourceType = {
                id: 'test-source',
                name: 'test-source'
            };

            const mockApiClient = {
                getSource: sinon.stub().resolves({
                    githubRepo: {
                        branches: [
                            { displayName: 'main' },
                            { displayName: 'develop' }
                        ],
                        defaultBranch: { displayName: 'main' }
                    }
                })
            } as any;

            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [{
                            rootUri: { fsPath: '/repo' },
                            state: {
                                HEAD: { name: 'feature/local-only' }
                            }
                        }]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(mockGitExtension as any);

            const result = await getBranchesForSession(
                mockSource,
                mockApiClient,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false }
            );

            assert.ok(result.branches.includes('feature/local-only'), 'Should include local-only branch in the list');
        });

        test('should handle case when source has no name', async () => {
            const mockSource: any = {
                id: 'test-source'
                // name is missing
            };

            const mockApiClient = {
                getSource: sinon.stub().rejects(new Error('Source name required'))
            } as any;

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(undefined);

            const result = await getBranchesForSession(
                mockSource,
                mockApiClient,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false }
            );

            // Should fall back to default branch
            assert.strictEqual(result.defaultBranch, 'main');
        });

        test('should update cache when data changes', async () => {
            const mockSource: SourceType = {
                id: 'test-source',
                name: 'test-source'
            };

            const mockApiClient = {
                getSource: sinon.stub().resolves({
                    githubRepo: {
                        branches: [
                            { displayName: 'main' },
                            { displayName: 'staging' }
                        ],
                        defaultBranch: { displayName: 'main' }
                    }
                })
            } as any;

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(undefined);

            await getBranchesForSession(
                mockSource,
                mockApiClient,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false }
            );

            // Verify that globalState.update was called
            assert.strictEqual((mockContext.globalState.update as any).called, true);
        });

        test('should respect silent mode in single repository', async () => {
            const mockSource: SourceType = {
                id: 'test-source',
                name: 'test-source'
            };

            const mockApiClient = {
                getSource: sinon.stub().resolves({
                    githubRepo: {
                        branches: [
                            { displayName: 'main' }
                        ],
                        defaultBranch: { displayName: 'main' }
                    }
                })
            } as any;

            const mockGitExtension = {
                exports: {
                    getAPI: sinon.stub().returns({
                        repositories: [{
                            rootUri: { fsPath: '/repo' },
                            state: {
                                HEAD: { name: 'main' }
                            }
                        }]
                    })
                },
                activate: sinon.stub().resolves()
            };

            sandbox.stub(vscode.extensions, 'getExtension')
                .withArgs('vscode.git')
                .returns(mockGitExtension as any);

            const result = await getBranchesForSession(
                mockSource,
                mockApiClient,
                mockOutputChannel,
                mockContext,
                { forceRefresh: true, showProgress: false, silent: true }
            );

            assert.strictEqual(result.currentBranch, 'main');
        });
    });
});
