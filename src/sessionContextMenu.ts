import * as vscode from "vscode";
import * as path from "path";
import type { Session } from "./types";
import { GitHubAuth } from "./githubAuth";
import { getPullRequestBranchInfo, type PullRequestBranchInfo } from "./githubUtils";

/**
 * Extracts the source branch name (PR head branch) from a session.
 * This is the branch that was used to create the PR.
 * Returns null if no branch information is available.
 */
export function getBranchNameForSession(session: Session): string | null {
    try {
        const branchName = session.sourceContext?.githubRepoContext?.startingBranch;
        if (!branchName || typeof branchName !== "string" || branchName.trim() === "") {
            return null;
        }
        return branchName.trim();
    } catch (error) {
        console.warn(`[Jules] Unexpected error extracting branch name from session`);
        return null;
    }
}

/**
 * Checkout to a specified branch using VS Code's Git extension.
 * Handles various error cases including missing Git extension, uncommitted changes, etc.
 * 
 * @param branchName The name of the branch to checkout
 * @param logChannel Optional output channel for logging
 * @returns true if checkout succeeded, false otherwise
 */
export async function checkoutToBranch(
    branchName: string,
    logChannel?: vscode.OutputChannel
): Promise<boolean> {
    const log = (msg: string) => {
        console.log(`[Jules] ${msg}`);
        logChannel?.appendLine(`[Jules] ${msg}`);
    };

    try {
        // Get Git extension
        const gitExtension = vscode.extensions.getExtension("vscode.git");
        if (!gitExtension) {
            vscode.window.showErrorMessage(
                "Git extension is not available. Please ensure Git is installed."
            );
            return false;
        }

        // Ensure Git extension is activated before accessing API
        await gitExtension.activate();
        const git = gitExtension.exports.getAPI(1);
        if (!git) {
            vscode.window.showErrorMessage(
                "Failed to access Git API."
            );
            return false;
        }

        // Get repository
        const repositories = git.repositories;
        if (!repositories || repositories.length === 0) {
            vscode.window.showErrorMessage(
                "No Git repository found in the workspace."
            );
            return false;
        }

        // Select repository helper
        const repository = await selectRepository(repositories, log);
        if (!repository) {
            return false;
        }

        // Handle uncommitted changes
        const canProceed = await handleUncommittedChanges(repository, branchName, log);
        if (!canProceed) {
            return false;
        }

        log(`Checking out to branch: ${branchName}`);

        // Try to checkout the branch
        return await performCheckout(repository, branchName, log);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Jules] Checkout error: ${msg}`);
        logChannel?.appendLine(`[Jules] Checkout error: ${msg}`);
        vscode.window.showErrorMessage(
            `Failed to checkout: ${msg}`
        );
        return false;
    }
}

/**
 * セッションからPR情報を使ってブランチをチェックアウトする
 * GitHub認証を活用してPRのブランチ情報を取得し、リモートからフェッチ＆チェックアウトする
 * GitHub認証がない場合やAPI失敗時は、セッションデータからのフォールバックを使用
 * 
 * @param session Julesセッション
 * @param logChannel オプションのログチャンネル
 * @returns 成功時true
 */
export async function checkoutToBranchForSession(
    session: Session,
    logChannel?: vscode.OutputChannel
): Promise<boolean> {
    const log = (msg: string) => {
        console.log(`[Jules] ${msg}`);
        logChannel?.appendLine(`[Jules] ${msg}`);
    };

    try {
        // Get Git extension
        const gitExtension = vscode.extensions.getExtension("vscode.git");
        if (!gitExtension) {
            vscode.window.showErrorMessage(
                "Git extension is not available. Please ensure Git is installed."
            );
            return false;
        }

        await gitExtension.activate();
        const git = gitExtension.exports.getAPI(1);
        if (!git) {
            vscode.window.showErrorMessage(
                "Failed to access Git API."
            );
            return false;
        }

        const repositories = git.repositories;
        if (!repositories || repositories.length === 0) {
            vscode.window.showErrorMessage(
                "No Git repository found in the workspace."
            );
            return false;
        }

        // Select repository
        const repository = await selectRepository(repositories, log);
        if (!repository) {
            return false;
        }

        // まずGitHub APIでPR情報を取得
        log("Attempting to fetch branch info from GitHub API...");
        const branchInfo = await fetchBranchInfoFromPR(session, logChannel);

        if (branchInfo) {
            log(`PR branch info found: ${branchInfo.headBranch} from ${branchInfo.headOwner}/${branchInfo.headRepo}`);

            // Handle uncommitted changes before checkout
            const canProceed = await handleUncommittedChanges(repository, branchInfo.headBranch, log);
            if (!canProceed) {
                return false;
            }

            // GitHub API経由でフェッチ＆チェックアウト
            const success = await fetchAndCheckoutFromPRInfo(branchInfo, repository, logChannel);
            if (success) {
                return true;
            }

            log("GitHub API checkout failed, falling back to session data...");
        } else {
            log("GitHub API unavailable or failed, using session data fallback...");
        }

        // フォールバック: セッションデータからブランチ名を取得
        const fallbackBranch = getBranchNameForSession(session);
        if (!fallbackBranch) {
            vscode.window.showErrorMessage(
                "No branch information available for this session."
            );
            return false;
        }

        log(`Using fallback branch from session: ${fallbackBranch}`);

        // Handle uncommitted changes for fallback branch
        const canProceedFallback = await handleUncommittedChanges(repository, fallbackBranch, log);
        if (!canProceedFallback) {
            return false;
        }

        // 既存のチェックアウトロジックを使用
        return await performCheckout(repository, fallbackBranch, log);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Jules] Checkout error: ${msg}`);
        logChannel?.appendLine(`[Jules] Checkout error: ${msg}`);
        vscode.window.showErrorMessage(
            `Failed to checkout: ${msg}`
        );
        return false;
    }
}

/**
 * リポジトリを選択するヘルパー関数
 */
async function selectRepository(
    repositories: any[],
    log: (msg: string) => void
): Promise<any | null> {
    if (repositories.length === 1) {
        return repositories[0];
    }

    interface RepoItem extends vscode.QuickPickItem {
        repo: any;
    }
    const repoItems: RepoItem[] = repositories.map((repo: any, index: number) => ({
        label: path.basename(repo.rootUri.fsPath) || `Repository ${index + 1}`,
        description: repo.rootUri.fsPath,
        repo
    }));
    const selected = await vscode.window.showQuickPick(repoItems, {
        placeHolder: "Select a Git repository for checkout"
    });
    if (!selected) {
        log("Repository selection cancelled");
        return null;
    }
    return selected.repo;
}

/**
 * 未コミット変更のハンドリング
 */
async function handleUncommittedChanges(
    repository: any,
    branchName: string,
    log: (msg: string) => void
): Promise<boolean> {
    const hasUncommittedChanges =
        (repository.state?.workingTreeChanges?.length ?? 0) > 0 ||
        (repository.state?.indexChanges?.length ?? 0) > 0;

    if (!hasUncommittedChanges) {
        return true;
    }

    const action = await vscode.window.showWarningMessage(
        `You have uncommitted changes. Checkout to "${branchName}" may fail or cause issues.`,
        { modal: true },
        "Checkout Anyway",
        "Stash Changes & Checkout",
        "Cancel"
    );

    if (action === "Cancel" || !action) {
        log("Checkout cancelled due to uncommitted changes");
        return false;
    }

    if (action === "Stash Changes & Checkout") {
        try {
            await repository.stash();
            log("Changes stashed successfully");
        } catch (stashError) {
            const msg = stashError instanceof Error ? stashError.message : String(stashError);
            vscode.window.showErrorMessage(`Failed to stash changes: ${msg}`);
            return false;
        }
    }

    return true;
}

/**
 * チェックアウト実行（ローカル→リモートフェッチのフォールバック付き）
 */
async function performCheckout(
    repository: any,
    branchName: string,
    log: (msg: string) => void
): Promise<boolean> {
    try {
        await repository.checkout(branchName);
        log(`Successfully checked out to branch: ${branchName}`);
        vscode.window.showInformationMessage(
            `Checked out to branch: ${branchName}`
        );
        return true;
    } catch (checkoutError: any) {
        const errorMsg = checkoutError?.message || String(checkoutError);

        // If branch not found locally, try to fetch and checkout from remote
        // Note: These error message checks depend on Git CLI's output strings,
        // which may change in future Git versions or vary by locale.
        if (errorMsg.includes("did not match") || errorMsg.includes("not found") || errorMsg.includes("pathspec")) {
            log(`Branch "${branchName}" not found locally, attempting to fetch from remote...`);

            const fetchAndCheckout = await vscode.window.showInformationMessage(
                `Branch "${branchName}" not found locally. Fetch from remote?`,
                "Fetch & Checkout",
                "Cancel"
            );

            if (fetchAndCheckout !== "Fetch & Checkout") {
                return false;
            }

            try {
                // Fetch all remotes
                await repository.fetch();
                log("Fetched from remotes successfully");

                // Try checkout again (Git should now see the remote branch)
                await repository.checkout(branchName);
                log(`Successfully checked out to branch: ${branchName}`);
                vscode.window.showInformationMessage(
                    `Checked out to branch: ${branchName}`
                );
                return true;
            } catch (fetchError: any) {
                const fetchMsg = fetchError?.message || String(fetchError);
                log(`Failed to fetch and checkout: ${fetchMsg}`);
                vscode.window.showErrorMessage(
                    `Failed to checkout branch "${branchName}": ${fetchMsg}`
                );
                return false;
            }
        }

        // Other checkout errors
        log(`Checkout failed: ${errorMsg}`);
        vscode.window.showErrorMessage(
            `Failed to checkout branch "${branchName}": ${errorMsg}`
        );
        return false;
    }
}

/**
 * Extracts PR URL from a session, with URL parsing-based validation.
 * Returns null if no PR URL is found or if the URL is invalid.
 * 
 * Validation:
 * - Must be a valid URL with https:// protocol
 * - Must be hosted on github.com
 * - Must have path matching /owner/repo/pull/number
 * - Canonical form is returned (without query strings or fragments)
 */
export function getPullRequestUrlForSession(session: Session): string | null {
    try {
        // Extract PR URL from outputs
        const raw = session.outputs?.find((o) => o.pullRequest)?.pullRequest?.url;

        if (!raw) {
            return null;
        }

        // Validate: Must be a string
        if (typeof raw !== "string") {
            console.warn(`[Jules] PR URL type validation failed: expected string, got ${typeof raw}`);
            return null;
        }

        // Parse URL
        let u: URL;
        try {
            u = new URL(raw);
        } catch (e) {
            console.warn(`[Jules] PR URL parsing failed: invalid URL format`);
            return null;
        }

        // Validate protocol and hostname
        if (u.protocol !== "https:") {
            console.warn(`[Jules] PR URL protocol validation failed: expected https:, got ${u.protocol}`);
            return null;
        }

        if (u.hostname !== "github.com") {
            console.warn(`[Jules] PR URL hostname validation failed: expected github.com, got ${u.hostname}`);
            return null;
        }

        // Parse pathname: should be /owner/repo/pull/number
        const segments = u.pathname
            .split("/")
            .filter((seg) => seg.length > 0);

        if (segments.length < 4) {
            console.warn(`[Jules] PR URL pathname validation failed: expected at least 4 segments, got ${segments.length}`);
            return null;
        }

        const [owner, repo, pullKeyword, numberStr] = segments;

        // Validate owner and repo are not empty
        if (!owner || !repo) {
            console.warn(`[Jules] PR URL owner/repo validation failed: owner or repo is empty`);
            return null;
        }

        // Validate pull keyword
        if (pullKeyword !== "pull") {
            console.warn(`[Jules] PR URL keyword validation failed: expected 'pull', got '${pullKeyword}'`);
            return null;
        }

        // Validate number is a positive integer
        if (!/^\d+$/.test(numberStr)) {
            console.warn(`[Jules] PR URL number validation failed: expected numeric PR number, got '${numberStr}'`);
            return null;
        }

        // Return canonical form (normalized URL without query/fragment)
        const canonical = `https://github.com/${owner}/${repo}/pull/${numberStr}`;
        return canonical;
    } catch (error) {
        console.warn(`[Jules] Unexpected error extracting PR URL from session`);
        return null;
    }
}

/**
 * Opens a PR URL in the default browser.
 * Shows error message if URL cannot be opened.
 */
export async function openPullRequestInBrowser(prUrl: string): Promise<void> {
    try {
        const success = await vscode.env.openExternal(vscode.Uri.parse(prUrl));
        if (!success) {
            vscode.window.showErrorMessage(
                "Failed to open pull request in browser."
            );
        }
    } catch (error) {
        console.error("Failed to open pull request in browser:", error);
        vscode.window.showErrorMessage(
            "Failed to open pull request in browser."
        );
    }
}

/**
 * PR URLから owner, repo, prNumber を抽出する
 * 
 * @param prUrl GitHub PR URL (e.g., "https://github.com/owner/repo/pull/123")
 * @returns パース結果、失敗時はnull
 */
export function parsePullRequestUrl(prUrl: string): { owner: string; repo: string; prNumber: number } | null {
    try {
        const u = new URL(prUrl);
        if (u.hostname !== "github.com") {
            return null;
        }
        const segments = u.pathname.split("/").filter((s) => s.length > 0);
        if (segments.length < 4 || segments[2] !== "pull") {
            return null;
        }
        const prNumber = parseInt(segments[3], 10);
        if (isNaN(prNumber) || prNumber <= 0) {
            return null;
        }
        return {
            owner: segments[0],
            repo: segments[1],
            prNumber
        };
    } catch {
        return null;
    }
}

/**
 * セッションからPR情報を取得し、GitHub APIでブランチ情報を取得する
 * GitHub認証が必要。認証がない場合やAPI呼び出しに失敗した場合はnullを返す
 * 
 * @param session Julesセッション
 * @param logChannel オプションのログチャンネル
 * @returns PRブランチ情報、取得失敗時はnull
 */
export async function fetchBranchInfoFromPR(
    session: Session,
    logChannel?: vscode.OutputChannel
): Promise<PullRequestBranchInfo | null> {
    const log = (msg: string) => {
        console.log(`[Jules] ${msg}`);
        logChannel?.appendLine(`[Jules] ${msg}`);
    };

    // セッションからPR URLを取得
    const prUrl = getPullRequestUrlForSession(session);
    if (!prUrl) {
        log("No PR URL found in session");
        return null;
    }

    // PR URLをパース
    const parsed = parsePullRequestUrl(prUrl);
    if (!parsed) {
        log(`Failed to parse PR URL: ${prUrl}`);
        return null;
    }

    log(`Fetching PR info from GitHub API: ${parsed.owner}/${parsed.repo}#${parsed.prNumber}`);

    // GitHub認証トークンを取得
    const token = await GitHubAuth.getToken();
    if (!token) {
        log("GitHub authentication not available, falling back to session data");
        return null;
    }

    // GitHub APIでPR情報を取得
    const branchInfo = await getPullRequestBranchInfo(
        token,
        parsed.owner,
        parsed.repo,
        parsed.prNumber
    );

    if (branchInfo) {
        log(`PR branch info retrieved: head=${branchInfo.headBranch}, owner=${branchInfo.headOwner}/${branchInfo.headRepo}`);
    }

    return branchInfo;
}

/**
 * GitHub API経由でPRのリモートブランチをフェッチしてチェックアウトする
 * フォークからのPRにも対応し、必要に応じてリモートを追加する
 * 
 * @param branchInfo PRブランチ情報
 * @param repository Gitリポジトリ
 * @param logChannel オプションのログチャンネル
 * @returns 成功時true
 */
async function fetchAndCheckoutFromPRInfo(
    branchInfo: PullRequestBranchInfo,
    repository: any,
    logChannel?: vscode.OutputChannel
): Promise<boolean> {
    const log = (msg: string) => {
        console.log(`[Jules] ${msg}`);
        logChannel?.appendLine(`[Jules] ${msg}`);
    };

    const { headBranch, headOwner, headRepo, headCloneUrl } = branchInfo;

    try {
        // リポジトリのリモート一覧を取得
        const remotes: { remote: string; fetchUrl: string }[] = repository.state?.remotes || [];
        
        // headCloneUrlに一致するリモートを探す
        let targetRemote = remotes.find(
            (r: { fetchUrl?: string; pushUrl?: string }) => 
                r.fetchUrl === headCloneUrl || r.fetchUrl?.replace('.git', '') === headCloneUrl.replace('.git', '')
        );

        // フォークからのPRで、対応するリモートがない場合
        if (!targetRemote) {
            // origin/upstreamを確認
            const originRemote = remotes.find((r: { remote: string }) => r.remote === 'origin');
            
            // originがheadCloneUrlと同じなら、originを使う
            if (originRemote?.fetchUrl?.includes(`${headOwner}/${headRepo}`)) {
                targetRemote = originRemote;
            } else {
                // フォークからのPRの場合、リモートを追加するか確認
                const addRemote = await vscode.window.showInformationMessage(
                    `This PR is from a fork (${headOwner}/${headRepo}). Add as remote to fetch the branch?`,
                    "Add Remote & Fetch",
                    "Cancel"
                );

                if (addRemote !== "Add Remote & Fetch") {
                    return false;
                }

                // リモートを追加
                const remoteName = headOwner.toLowerCase();
                try {
                    log(`Adding remote "${remoteName}" with URL: ${headCloneUrl}`);
                    await repository.addRemote(remoteName, headCloneUrl);
                    targetRemote = { remote: remoteName, fetchUrl: headCloneUrl };
                    log(`Remote "${remoteName}" added successfully`);
                } catch (addError: any) {
                    // 既に存在する場合は無視
                    if (!addError?.message?.includes("already exists")) {
                        throw addError;
                    }
                    targetRemote = { remote: remoteName, fetchUrl: headCloneUrl };
                }
            }
        }

        const remoteName = (targetRemote as { remote: string }).remote || 'origin';

        // 特定のリモートからフェッチ
        log(`Fetching from remote "${remoteName}"...`);
        await repository.fetch(remoteName);
        log(`Fetched from remote "${remoteName}" successfully`);

        // チェックアウト
        // まずローカルブランチ名でトライ
        try {
            await repository.checkout(headBranch);
            log(`Successfully checked out to branch: ${headBranch}`);
            vscode.window.showInformationMessage(
                `Checked out to branch: ${headBranch}`
            );
            return true;
        } catch (checkoutError: any) {
            // ローカルにない場合、リモートトラッキングブランチからチェックアウト
            const trackingBranch = `${remoteName}/${headBranch}`;
            log(`Local branch not found, trying tracking branch: ${trackingBranch}`);
            
            try {
                // createBranch でリモートトラッキングブランチからローカルブランチを作成
                await repository.createBranch(headBranch, true, trackingBranch);
                log(`Created local branch "${headBranch}" from "${trackingBranch}"`);
                vscode.window.showInformationMessage(
                    `Checked out to branch: ${headBranch}`
                );
                return true;
            } catch (createError: any) {
                // createBranch が失敗した場合、直接チェックアウトを試みる
                const createMsg = createError?.message || String(createError);
                log(`createBranch failed: ${createMsg}, trying direct checkout to ${trackingBranch}`);
                
                try {
                    await repository.checkout(trackingBranch);
                    log(`Successfully checked out to tracking branch: ${trackingBranch}`);
                    vscode.window.showInformationMessage(
                        `Checked out to branch: ${trackingBranch} (detached HEAD)`
                    );
                    return true;
                } catch (finalError: any) {
                    const finalMsg = finalError?.message || String(finalError);
                    log(`All checkout attempts failed: ${finalMsg}`);
                    throw finalError;
                }
            }
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`fetchAndCheckoutFromPRInfo failed: ${msg}`);
        return false;
    }
}
