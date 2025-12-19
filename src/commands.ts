import * as vscode from 'vscode';
import {
    Source as SourceType,
    SourcesResponse,
    CreateSessionRequest,
    SessionResponse,
    Session,
    ActivitiesResponse
} from './types';
import {
    JULES_API_BASE_URL,
    VIEW_DETAILS_ACTION,
    SHOW_ACTIVITIES_COMMAND,
    MAX_PLAN_STEPS_IN_NOTIFICATION,
    MAX_PLAN_STEP_LENGTH,
    SESSION_STATE
} from './constants';
import {
    getStoredApiKey,
    resolveSessionId,
    approvePlan,
    notifyPRCreated,
    previousSessionStates,
    updatePreviousStates
} from './sessionManager';
import {
    JulesSessionsProvider,
    SessionTreeItem,
    isFetchingSensitiveData,
    setIsFetchingSensitiveData
} from './sessionViewProvider';
import { logChannel } from './logger';
import { JulesApiClient } from './julesApiClient';
import {
    getBranchesForSession,
    getRepoInfoForBranchCreation,
    createRemoteBranch
} from './branchUtils';
import { showMessageComposer, buildFinalPrompt } from './composer';
import { GitHubAuth } from './githubAuth';
import { fetchWithTimeout } from './fetchUtils';
import { SourcesCache, isCacheValid } from './cache';
import { stripUrlCredentials, sanitizeForLogging } from './securityUtils';
import { updateStatusBar, handleOpenInWebApp, SourceQuickPickItem } from './uiUtils';
import { resetAutoRefresh } from './autoRefresh';

export function registerCommands(
    context: vscode.ExtensionContext,
    sessionsProvider: JulesSessionsProvider,
    statusBarItem: vscode.StatusBarItem,
    activitiesChannel: vscode.OutputChannel
) {

    const signInDisposable = vscode.commands.registerCommand('jules-extension.signInGitHub', async () => {
        const token = await GitHubAuth.signIn();
        if (token) {
            const userInfo = await GitHubAuth.getUserInfo();
            vscode.window.showInformationMessage(
                `Signed in to GitHub as ${userInfo?.login || 'user'}`
            );
            logChannel.appendLine(`[Jules] Signed in to GitHub as ${userInfo?.login}`);
        }
    });

    const setApiKeyDisposable = vscode.commands.registerCommand(
        "jules-extension.setApiKey",
        async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: "Enter your Jules API Key",
                password: true,
            });
            if (apiKey) {
                await context.secrets.store("jules-api-key", apiKey);
                vscode.window.showInformationMessage("API Key saved securely.");
            }
        }
    );

    const verifyApiKeyDisposable = vscode.commands.registerCommand(
        "jules-extension.verifyApiKey",
        async () => {
            const apiKey = await getStoredApiKey(context);
            if (!apiKey) {
                return;
            }
            try {
                const response = await fetchWithTimeout(`${JULES_API_BASE_URL}/sources`, {
                    method: "GET",
                    headers: {
                        "X-Goog-Api-Key": apiKey,
                        "Content-Type": "application/json",
                    },
                });
                if (response.ok) {
                    vscode.window.showInformationMessage("API Key is valid.");
                } else {
                    vscode.window.showErrorMessage(
                        "API Key is invalid. Please check and set a correct key."
                    );
                }
            } catch (error) {
                vscode.window.showErrorMessage(
                    "Failed to verify API Key. Please check your internet connection."
                );
            }
        }
    );

    const listSourcesDisposable = vscode.commands.registerCommand(
        "jules-extension.listSources",
        async () => {
            const apiKey = await getStoredApiKey(context);
            if (!apiKey) {
                return;
            }

            setIsFetchingSensitiveData(true);
            resetAutoRefresh(context, sessionsProvider);

            try {
                const cacheKey = 'jules.sources';
                const cached = context.globalState.get<SourcesCache>(cacheKey);
                let sources: SourceType[];

                if (cached && isCacheValid(cached.timestamp)) {
                    logChannel.appendLine('Using cached sources');
                    sources = cached.sources;
                } else {
                    sources = await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Fetching sources...',
                        cancellable: false
                    }, async (progress) => {
                        const response = await fetchWithTimeout(`${JULES_API_BASE_URL}/sources`, {
                            method: "GET",
                            headers: {
                                "X-Goog-Api-Key": apiKey,
                                "Content-Type": "application/json",
                            },
                        });
                        if (!response.ok) {
                            throw new Error(`Failed to fetch sources: ${response.status} ${response.statusText}`);
                        }
                        const data = (await response.json()) as SourcesResponse;
                        if (!data.sources || !Array.isArray(data.sources)) {
                            throw new Error("Invalid response format from API.");
                        }
                        await context.globalState.update(cacheKey, { sources: data.sources, timestamp: Date.now() });
                        logChannel.appendLine(`Fetched ${data.sources.length} sources`);
                        return data.sources;
                    });
                }

                const items: SourceQuickPickItem[] = sources.map((source) => ({
                    label: source.name || source.id || "Unknown",
                    description: source.url || "",
                    detail: source.description || "",
                    source: source,
                }));
                const selected: SourceQuickPickItem | undefined =
                    await vscode.window.showQuickPick(items, {
                        placeHolder: "Select a Jules Source",
                    });
                if (selected) {
                    await context.globalState.update("selected-source", selected.source);
                    vscode.commands.executeCommand('setContext', 'jules-extension.hasSelectedSource', true);
                    vscode.window.showInformationMessage(
                        `Selected source: ${selected.label}`
                    );
                    updateStatusBar(context, statusBarItem);
                    sessionsProvider.refresh();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error occurred.";
                logChannel.appendLine(`Failed to list sources: ${message}`);
                vscode.window.showErrorMessage(`Failed to list sources: ${message}`);
            } finally {
                setIsFetchingSensitiveData(false);
                resetAutoRefresh(context, sessionsProvider);
            }
        }
    );

    const createSessionDisposable = vscode.commands.registerCommand(
        "jules-extension.createSession",
        async () => {
            const selectedSource = context.globalState.get(
                "selected-source"
            ) as SourceType;
            if (!selectedSource) {
                vscode.window.showErrorMessage(
                    "No source selected. Please list and select a source first."
                );
                return;
            }
            const apiKey = await context.secrets.get("jules-api-key");
            if (!apiKey) {
                vscode.window.showErrorMessage(
                    'API Key not found. Please set it first using "Set Jules API Key" command.'
                );
                return;
            }

            const apiClient = new JulesApiClient(apiKey, JULES_API_BASE_URL);

            setIsFetchingSensitiveData(true);
            resetAutoRefresh(context, sessionsProvider);
            try {
                // ブランチ選択ロジック（メッセージ入力前に移動）
                const { branches, defaultBranch: selectedDefaultBranch, currentBranch, remoteBranches } = await getBranchesForSession(selectedSource, apiClient, logChannel, context, { showProgress: true });

                // QuickPickでブランチ選択
                const selectedBranch = await vscode.window.showQuickPick(
                    branches.map(branch => ({
                        label: branch,
                        picked: branch === selectedDefaultBranch,
                        description: (
                            branch === selectedDefaultBranch ? '(default)' : undefined
                        ) || (
                                branch === currentBranch ? '(current)' : undefined
                            )
                    })),
                    {
                        placeHolder: 'Select a branch for this session',
                        title: 'Branch Selection'
                    }
                );

                if (!selectedBranch) {
                    vscode.window.showWarningMessage("Branch selection was cancelled.");
                    return;
                }

                let startingBranch = selectedBranch.label;

                // リモートブランチの存在チェック
                // キャッシュが古い場合、リモートに存在するブランチが見つからないことがあるため、
                // キャッシュにないブランチが選択された場合は最新のリモートブランチを再取得する
                let currentRemoteBranches = remoteBranches;
                if (!new Set(remoteBranches).has(startingBranch)) {
                    logChannel.appendLine(`[Jules] Branch "${startingBranch}" not found in cached remote branches, re-fetching...`);

                    // リモートブランチを再取得（キャッシュを無視）
                    const freshBranchInfo = await getBranchesForSession(selectedSource, apiClient, logChannel, context, { forceRefresh: true, showProgress: true });
                    currentRemoteBranches = freshBranchInfo.remoteBranches;

                    logChannel.appendLine(`[Jules] Re-fetched ${currentRemoteBranches.length} remote branches`);
                }

                if (!new Set(currentRemoteBranches).has(startingBranch)) {
                    // ローカル専用ブランチの場合
                    logChannel.appendLine(`[Jules] Warning: Branch "${startingBranch}" not found on remote`);

                    const action = await vscode.window.showWarningMessage(
                        `Branch "${startingBranch}" exists locally but has not been pushed to remote.\n\nJules requires a remote branch to start a session.`,
                        { modal: true },
                        'Create Remote Branch',
                        'Use Default Branch'
                    );

                    if (action === 'Create Remote Branch') {
                        const creationInfo = await getRepoInfoForBranchCreation(logChannel);
                        if (!creationInfo) {
                            return; // エラーメッセージはヘルパー内で表示済み
                        }

                        // リモートブランチを作成
                        try {
                            await vscode.window.withProgress(
                                {
                                    location: vscode.ProgressLocation.Notification,
                                    title: "Creating remote branch...",
                                    cancellable: false,
                                },
                                async (progress) => {
                                    progress.report({ increment: 0, message: "Initializing..." });
                                    await createRemoteBranch(
                                        creationInfo.token,
                                        creationInfo.owner,
                                        creationInfo.repo,
                                        startingBranch,
                                        logChannel
                                    );
                                    progress.report({ increment: 100, message: "Remote branch created!" });
                                }
                            );
                            logChannel.appendLine(`[Jules] Remote branch "${startingBranch}" created successfully`);
                            vscode.window.showInformationMessage(`Remote branch "${startingBranch}" created successfully.`);

                            // Force refresh branches cache after remote branch creation
                            try {
                                await getBranchesForSession(selectedSource, apiClient, logChannel, context, { forceRefresh: true, showProgress: true });
                                logChannel.appendLine('[Jules] Branches cache refreshed after remote branch creation');
                            } catch (error) {
                                logChannel.appendLine(`[Jules] Failed to refresh branches cache: ${error}`);
                            }
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : "Unknown error";
                            logChannel.appendLine(`[Jules] Failed to create remote branch: ${errorMessage}`);
                            vscode.window.showErrorMessage(`Failed to create remote branch: ${errorMessage}`);
                            return;
                        }
                    } else if (action === 'Use Default Branch') {
                        startingBranch = selectedDefaultBranch;
                        logChannel.appendLine(`[Jules] Using default branch: ${sanitizeForLogging(selectedDefaultBranch)}`);
                    } else {
                        logChannel.appendLine('[Jules] Session creation cancelled by user');
                        return;
                    }
                } else {
                    logChannel.appendLine(`[Jules] Branch "${startingBranch}" found on remote`);
                }

                const result = await showMessageComposer({
                    title: "Create Jules Session",
                    placeholder: "Describe the task you want Jules to tackle...",
                    showCreatePrCheckbox: true,
                    showRequireApprovalCheckbox: true,
                });

                if (result === undefined) {
                    vscode.window.showWarningMessage("Session creation was cancelled.");
                    return;
                }

                const userPrompt = result.prompt.trim();
                if (!userPrompt) {
                    vscode.window.showWarningMessage(
                        "Task description was empty. Session not created."
                    );
                    return;
                }
                const finalPrompt = buildFinalPrompt(userPrompt);
                const title = userPrompt.split("\n")[0];
                const automationMode = result.createPR ? "AUTO_CREATE_PR" : "MANUAL";
                const requestBody: CreateSessionRequest = {
                    prompt: finalPrompt,
                    sourceContext: {
                        source: selectedSource.name || selectedSource.id || "",
                        githubRepoContext: {
                            startingBranch,
                        },
                    },
                    automationMode,
                    title,
                    requirePlanApproval: result.requireApproval,
                };

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: "Creating Jules Session...",
                        cancellable: false,
                    },
                    async (progress) => {
                        progress.report({
                            increment: 0,
                            message: "Sending request...",
                        });
                        const response = await fetchWithTimeout(`${JULES_API_BASE_URL}/sessions`, {
                            method: "POST",
                            headers: {
                                "X-Goog-Api-Key": apiKey,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(requestBody),
                        });
                        progress.report({
                            increment: 50,
                            message: "Processing response...",
                        });
                        if (!response.ok) {
                            throw new Error(
                                `Failed to create session: ${response.status} ${response.statusText}`
                            );
                        }
                        const session = (await response.json()) as SessionResponse;
                        await context.globalState.update("active-session-id", session.name);
                        progress.report({
                            increment: 100,
                            message: "Session created!",
                        });
                        vscode.window.showInformationMessage(
                            `Session created: ${session.name}`
                        );
                    }
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to create session: ${error instanceof Error ? error.message : "Unknown error"
                    }`
                );
            } finally {
                setIsFetchingSensitiveData(false);
                resetAutoRefresh(context, sessionsProvider);
            }
        }
    );

    const refreshSessionsDisposable = vscode.commands.registerCommand(
        "jules-extension.refreshSessions",
        () => {
            sessionsProvider.refresh(false); // Pass false for manual refresh
        }
    );

    function getActivityIcon(activity: any): string {
        if (activity.planGenerated) {
            return "📝";
        }
        if (activity.planApproved) {
            return "👍";
        }
        if (activity.progressUpdated) {
            return "🔄";
        }
        if (activity.sessionCompleted) {
            return "✅";
        }
        return "ℹ️";
    }

    const showActivitiesDisposable = vscode.commands.registerCommand(
        "jules-extension.showActivities",
        async (sessionId: string) => {
            const apiKey = await getStoredApiKey(context);
            if (!apiKey) {
                return;
            }
            try {
                const sessionResponse = await fetchWithTimeout(
                    `${JULES_API_BASE_URL}/${sessionId}`,
                    {
                        method: "GET",
                        headers: {
                            "X-Goog-Api-Key": apiKey,
                            "Content-Type": "application/json",
                        },
                    }
                );
                if (!sessionResponse.ok) {
                    const errorText = await sessionResponse.text();
                    vscode.window.showErrorMessage(
                        `Session not found: ${sessionResponse.status} ${sessionResponse.statusText} - ${errorText}`
                    );
                    return;
                }
                const session = (await sessionResponse.json()) as Session;
                const response = await fetchWithTimeout(
                    `${JULES_API_BASE_URL}/${sessionId}/activities`,
                    {
                        method: "GET",
                        headers: {
                            "X-Goog-Api-Key": apiKey,
                            "Content-Type": "application/json",
                        },
                    }
                );
                if (!response.ok) {
                    const errorText = await response.text();
                    vscode.window.showErrorMessage(
                        `Failed to fetch activities: ${response.status} ${response.statusText} - ${errorText}`
                    );
                    return;
                }
                const data = (await response.json()) as ActivitiesResponse;
                if (!data.activities || !Array.isArray(data.activities)) {
                    vscode.window.showErrorMessage("Invalid response format from API.");
                    return;
                }
                activitiesChannel.clear();
                activitiesChannel.show();
                activitiesChannel.appendLine(`Activities for session: ${sessionId}`);
                activitiesChannel.appendLine("---");
                if (data.activities.length === 0) {
                    activitiesChannel.appendLine("No activities found for this session.");
                } else {
                    let planDetected = false;
                    data.activities.forEach((activity) => {
                        const icon = getActivityIcon(activity);
                        const timestamp = new Date(activity.createTime).toLocaleString();
                        let message = "";
                        if (activity.planGenerated) {
                            message = `Plan generated: ${activity.planGenerated.plan?.title || "Plan"
                                }`;
                            planDetected = true;
                        } else if (activity.planApproved) {
                            message = `Plan approved: ${activity.planApproved.planId}`;
                        } else if (activity.progressUpdated) {
                            message = `Progress: ${activity.progressUpdated.title}${activity.progressUpdated.description
                                ? " - " + activity.progressUpdated.description
                                : ""
                                }`;
                        } else if (activity.sessionCompleted) {
                            message = "Session completed";
                        } else {
                            message = "Unknown activity";
                        }
                        activitiesChannel.appendLine(
                            `${icon} ${timestamp} (${activity.originator}): ${message}`
                        );
                    });
                }
                await context.globalState.update("active-session-id", sessionId);
            } catch (error) {
                vscode.window.showErrorMessage(
                    "Failed to fetch activities. Please check your internet connection."
                );
            }
        }
    );

    const refreshActivitiesDisposable = vscode.commands.registerCommand(
        "jules-extension.refreshActivities",
        async () => {
            const currentSessionId = context.globalState.get(
                "active-session-id"
            ) as string;
            if (!currentSessionId) {
                vscode.window.showErrorMessage(
                    "No current session selected. Please show activities first."
                );
                return;
            }
            await vscode.commands.executeCommand(
                "jules-extension.showActivities",
                currentSessionId
            );
        }
    );

    const sendMessageDisposable = vscode.commands.registerCommand(
        "jules-extension.sendMessage",
        async (item?: SessionTreeItem | string) => {
            // Logic for sendMessageToSession extracted inline or imported
            const apiKey = await getStoredApiKey(context);
            if (!apiKey) {
                return;
            }

            const sessionId = resolveSessionId(context, item);
            if (!sessionId) {
                vscode.window.showErrorMessage(
                    "No active session available. Please create or select a session first."
                );
                return;
            }

            try {
                const result = await showMessageComposer({
                    title: "Send Message to Jules",
                    placeholder: "What would you like Jules to do?",
                });

                if (result === undefined) {
                    vscode.window.showWarningMessage("Message was cancelled and not sent.");
                    return;
                }

                const userPrompt = result.prompt.trim();
                if (!userPrompt) {
                    vscode.window.showWarningMessage("Message was empty and not sent.");
                    return;
                }
                const finalPrompt = buildFinalPrompt(userPrompt);

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: "Sending message to Jules...",
                    },
                    async () => {
                        const response = await fetchWithTimeout(
                            `${JULES_API_BASE_URL}/${sessionId}:sendMessage`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "X-Goog-Api-Key": apiKey,
                                },
                                body: JSON.stringify({ prompt: finalPrompt }),
                            }
                        );

                        if (!response.ok) {
                            const errorText = await response.text();
                            const message =
                                errorText || `${response.status} ${response.statusText}`;
                            throw new Error(message);
                        }

                        vscode.window.showInformationMessage("Message sent successfully!");
                    }
                );

                await context.globalState.update("active-session-id", sessionId);
                await vscode.commands.executeCommand("jules-extension.refreshActivities");
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Unknown error occurred.";
                vscode.window.showErrorMessage(`Failed to send message: ${message}`);
            }
        }
    );

    const approvePlanDisposable = vscode.commands.registerCommand(
        "jules-extension.approvePlan",
        async () => {
            const sessionId = context.globalState.get<string>("active-session-id");
            if (!sessionId) {
                vscode.window.showErrorMessage(
                    "No active session. Please select a session first."
                );
                return;
            }
            await approvePlan(sessionId, context);
        }
    );

    const openSettingsDisposable = vscode.commands.registerCommand(
        "jules-extension.openSettings",
        () => {
            return vscode.commands.executeCommand(
                "workbench.action.openSettings",
                "@ext:HirokiMukai.jules-extension"
            );
        }
    );

    const deleteSessionDisposable = vscode.commands.registerCommand(
        "jules-extension.deleteSession",
        async (item?: SessionTreeItem) => {
            if (!item || !(item instanceof SessionTreeItem)) {
                vscode.window.showErrorMessage("No session selected.");
                return;
            }

            const session = item.session;
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete session "${session.title}" from local cache?\n\nNote: this only removes it locally and does not delete the session on Jules server.`,
                { modal: true },
                "Delete"
            );

            if (confirm !== "Delete") {
                return;
            }

            // Remove from previous states to hide it
            previousSessionStates.delete(session.name);
            await context.globalState.update(
                "jules.previousSessionStates",
                Object.fromEntries(previousSessionStates)
            );

            vscode.window.showInformationMessage(
                `Session "${session.title}" removed from local cache.`
            );

            // Refresh the view
            sessionsProvider.refresh();
        }
    );

    const setGithubTokenDisposable = vscode.commands.registerCommand(
        "jules-extension.setGithubToken",
        async () => {
            try {
                const token = await vscode.window.showInputBox({
                    prompt:
                        "Enter your GitHub Personal Access Token (used for PR status checks)",
                    password: true,
                    placeHolder: "Enter your GitHub PAT",
                    ignoreFocusOut: true,
                });

                if (token === undefined) {
                    // User cancelled the input
                    console.log("Jules: GitHub Token input cancelled by user");
                    return;
                }

                if (token === "") {
                    vscode.window.showWarningMessage(
                        "GitHub token was empty — cancelled."
                    );
                    return;
                }

                // Validate token format
                if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
                    const proceed = await vscode.window.showWarningMessage(
                        "The token you entered doesn't look like a typical GitHub token. Save anyway?",
                        { modal: true },
                        "Save",
                        "Cancel"
                    );
                    if (proceed !== "Save") {
                        return;
                    }
                }

                await context.secrets.store("jules-github-token", token);
                vscode.window.showInformationMessage(
                    "GitHub token saved securely."
                );
                // Clear PR status cache when token changes
                // Accessing cache directly via exported variable from sessionManager might be tricky if it's not exported.
                // It is exported as `prStatusCache` but let's check.
                // We might need a setter or clear function in sessionManager.
                // Assuming it's exported for now, but better to add a clear function later.
                // For now, let's just refresh.
                sessionsProvider.refresh();
            } catch (error) {
                console.error("Jules: Error setting GitHub Token:", error);
                vscode.window.showErrorMessage(
                    `GitHub Token の保存に失敗しました: ${error instanceof Error ? error.message : "Unknown error"
                    }`
                );
            }
        }
    );

    const setGitHubPatDisposable = vscode.commands.registerCommand(
        "jules-extension.setGitHubPat",
        async () => {
            // Deprecation warning — suggest OAuth sign-in instead of PAT
            const proceed = await vscode.window.showWarningMessage(
                'GitHub PAT is deprecated and will be removed in a future version.\n\nPlease use OAuth sign-in instead.',
                'Use OAuth (Recommended)',
                'Continue with PAT'
            );

            if (proceed === 'Use OAuth (Recommended)') {
                await vscode.commands.executeCommand('jules-extension.signInGitHub');
                return;
            }

            if (proceed !== 'Continue with PAT') {
                return; // user cancelled
            }
            const pat = await vscode.window.showInputBox({
                prompt: '[DEPRECATED] Enter GitHub Personal Access Token',
                password: true,
                placeHolder: 'Enter your GitHub PAT',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'PAT cannot be empty';
                    }

                    // 厳格なフォーマットチェック
                    const ghpPattern = /^ghp_[A-Za-z0-9]{36}$/;
                    const githubPatPattern = /^github_pat_[A-Za-z0-9_]{82}$/;

                    if (!ghpPattern.test(value) && !githubPatPattern.test(value)) {
                        return 'Invalid PAT format. Please enter a valid GitHub Personal Access Token.';
                    }

                    return null;
                }
            });

            if (pat) {
                // 追加の検証（validateInputが通った場合でも再チェック）
                const ghpPattern = /^ghp_[A-Za-z0-9]{36}$/;
                const githubPatPattern = /^github_pat_[A-Za-z0-9_]{82}$/;
                if (ghpPattern.test(pat) || githubPatPattern.test(pat)) {
                    await context.secrets.store('jules-github-pat', pat);
                    vscode.window.showInformationMessage('GitHub PAT saved (deprecated)');
                    logChannel.appendLine('[Jules] GitHub PAT saved (deprecated)');
                } else {
                    vscode.window.showErrorMessage('Invalid PAT format. PAT was not saved.');
                }
            }
        }
    );

    const clearCacheDisposable = vscode.commands.registerCommand(
        "jules-extension.clearCache",
        async () => {
            try {
                // すべてのキーを取得
                const allKeys = context.globalState.keys();

                // Sources & Branches キャッシュをフィルタ
                const branchCacheKeys = allKeys.filter(key => key.startsWith('jules.branches.'));
                const cacheKeys = ['jules.sources', ...branchCacheKeys];

                // すべてのキャッシュをクリア
                await Promise.all(
                    cacheKeys.map(key => context.globalState.update(key, undefined))
                );

                vscode.window.showInformationMessage(`Jules cache cleared: ${cacheKeys.length} entries removed`);
                logChannel.appendLine(`[Jules] Cache cleared: ${cacheKeys.length} entries (1 sources + ${branchCacheKeys.length} branches)`);
            } catch (error: any) {
                logChannel.appendLine(`[Jules] Error clearing cache: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to clear cache: ${error.message}`);
            }
        }
    );

    const openInWebAppDisposable = vscode.commands.registerCommand(
        "jules-extension.openInWebApp",
        (item?: SessionTreeItem) => handleOpenInWebApp(item, logChannel)
    );

    context.subscriptions.push(
        signInDisposable,
        setApiKeyDisposable,
        verifyApiKeyDisposable,
        listSourcesDisposable,
        createSessionDisposable,
        refreshSessionsDisposable,
        showActivitiesDisposable,
        refreshActivitiesDisposable,
        sendMessageDisposable,
        approvePlanDisposable,
        openSettingsDisposable,
        deleteSessionDisposable,
        setGithubTokenDisposable,
        setGitHubPatDisposable,
        clearCacheDisposable,
        openInWebAppDisposable
    );
}
