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
    });

    suite('getBranchesForSession', () => {
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

            assert.strictEqual(result.branches.length >= 3, true);
            assert.strictEqual(result.branches.includes('main'), true);
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

            assert.strictEqual(result.defaultBranch, 'main');
            assert.strictEqual(result.branches.includes('main'), true);
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

            assert.strictEqual(result.branches.includes('feature/local-only'), true);
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
