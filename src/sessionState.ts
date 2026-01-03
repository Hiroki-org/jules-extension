import * as vscode from 'vscode';
import { PRStatusCache, Session, SessionState } from './types';
import { extractPRUrl, areOutputsEqual } from './sessionUtils';
import { fetchWithTimeout } from './fetchUtils';
import { GitHubAuth } from './githubAuth';

export class SessionStateManager {
    private previousSessionStates: Map<string, SessionState> = new Map();
    private prStatusCache: PRStatusCache = {};
    private PR_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
    private notifiedSessions: Set<string> = new Set();
    private logChannel: vscode.OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
        logChannel: vscode.OutputChannel
    ) {
        this.logChannel = logChannel;
        // Load states from global state
        const storedStates = this.context.globalState.get<{ [key: string]: SessionState }>(
            "jules.previousSessionStates",
            {}
        );
        this.previousSessionStates = new Map(Object.entries(storedStates));
        console.log(
            `Jules: Loaded ${this.previousSessionStates.size} previous session states from global state.`
        );

        // Load PR cache
        this.prStatusCache = this.context.globalState.get<PRStatusCache>("jules.prStatusCache", {});
        this.cleanupExpiredCache();
    }

    private cleanupExpiredCache() {
        const now = Date.now();
        const expiredUrls = Object.keys(this.prStatusCache).filter(
            (url) => now - this.prStatusCache[url].lastChecked > this.PR_CACHE_DURATION
        );

        if (expiredUrls.length > 0) {
            expiredUrls.forEach((url) => delete this.prStatusCache[url]);
            console.log(`Jules: Cleaned up ${expiredUrls.length} expired PR status cache entries.`);
        }
    }

    public getPreviousState(sessionName: string): SessionState | undefined {
        return this.previousSessionStates.get(sessionName);
    }

    public isNotified(sessionName: string): boolean {
        return this.notifiedSessions.has(sessionName);
    }

    public markAsNotified(sessionName: string): void {
        this.notifiedSessions.add(sessionName);
    }

    public clearNotification(sessionName: string): void {
        this.notifiedSessions.delete(sessionName);
    }

    public async deleteSession(sessionName: string): Promise<void> {
        this.previousSessionStates.delete(sessionName);
        await this.saveStates();
    }

    private async saveStates() {
        await this.context.globalState.update(
            "jules.previousSessionStates",
            Object.fromEntries(this.previousSessionStates)
        );
    }

    public async checkPRStatus(
        prUrl: string
    ): Promise<boolean> {
        // Check cache first
        const cached = this.prStatusCache[prUrl];
        const now = Date.now();
        if (cached && now - cached.lastChecked < this.PR_CACHE_DURATION) {
            return cached.isClosed;
        }

        try {
            // Parse GitHub PR URL: https://github.com/owner/repo/pull/123
            const match = prUrl.match(
                /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
            );
            if (!match) {
                console.log(`Jules: Invalid GitHub PR URL format: ${prUrl}`);
                return false;
            }

            const [, owner, repo, prNumber] = match;
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

            // Prefer OAuth token, fallback to manually set PAT
            let token = await GitHubAuth.getToken();
            if (!token) {
                token = await this.context.secrets.get("jules-github-token");
                if (token) {
                    console.log("[Jules] Using fallback GitHub PAT for PR status check.");
                }
            }

            const headers: Record<string, string> = {
                Accept: "application/vnd.github.v3+json",
            };
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const response = await fetchWithTimeout(apiUrl, { headers });

            if (!response.ok) {
                console.log(
                    `Jules: Failed to fetch PR status: ${response.status} ${response.statusText}`
                );
                return false;
            }

            const prData = (await response.json()) as { state: string };
            const isClosed = prData.state === "closed";

            // Update cache
            this.prStatusCache[prUrl] = {
                isClosed,
                lastChecked: now,
            };

            // Persist cache
            await this.context.globalState.update("jules.prStatusCache", this.prStatusCache);

            return isClosed;
        } catch (error) {
            console.error(`Jules: Error checking PR status for ${prUrl}:`, error);
            return false;
        }
    }

    public clearPRStatusCache() {
        this.prStatusCache = {};
        // Note: Global state update happens on next check or explicit save if we added a method.
        // For now, it's just in-memory + what's in global state.
        // To be safe we should clear global state too.
        void this.context.globalState.update("jules.prStatusCache", {});
    }

    public checkForCompletedSessions(currentSessions: Session[]): Session[] {
        const completedSessions: Session[] = [];
        for (const session of currentSessions) {
            const prevState = this.previousSessionStates.get(session.name);
            if (prevState?.isTerminated) {
                continue; // Skip terminated sessions
            }
            if (
                session.state === "COMPLETED" &&
                (!prevState || prevState.state !== "COMPLETED")
            ) {
                const prUrl = extractPRUrl(session);
                if (prUrl) {
                    // Only count as a new completion if there's a PR URL.
                    completedSessions.push(session);
                }
            }
        }
        return completedSessions;
    }

    public checkForSessionsInState(
        currentSessions: Session[],
        targetState: string
    ): Session[] {
        return currentSessions.filter((session) => {
            const prevState = this.previousSessionStates.get(session.name);
            const isNotTerminated = !prevState?.isTerminated;
            const isTargetState = session.rawState === targetState;
            const isStateChanged = !prevState || prevState.rawState !== targetState;
            const willNotify = isNotTerminated && isTargetState && isStateChanged;
            if (isTargetState) {
                this.logChannel.appendLine(`Jules: Debug - Session ${session.name}: terminated=${!isNotTerminated}, rawState=${session.rawState}, prevRawState=${prevState?.rawState}, willNotify=${willNotify}`);
            }
            return willNotify;
        });
    }

    public async updatePreviousStates(
        currentSessions: Session[]
    ): Promise<boolean> {
        let hasChanged = false;

        // 1. Identify sessions that require PR status checks
        const sessionsToCheck = currentSessions.filter(session => {
            const prevState = this.previousSessionStates.get(session.name);
            if (prevState?.isTerminated) { return false; }
            return session.state === "COMPLETED" && extractPRUrl(session);
        });

        // 2. Perform checks in parallel
        const prStatusMap = new Map<string, boolean>();

        if (sessionsToCheck.length > 0) {
            await Promise.all(sessionsToCheck.map(async (session) => {
                const prUrl = extractPRUrl(session);
                const isClosed = await this.checkPRStatus(prUrl!);
                prStatusMap.set(session.name, isClosed);
            }));
        }

        for (const session of currentSessions) {
            const prevState = this.previousSessionStates.get(session.name);

            // If already terminated, we don't need to check again.
            if (prevState?.isTerminated) {
                if (
                    prevState.state !== session.state ||
                    prevState.rawState !== session.rawState ||
                    !areOutputsEqual(prevState.outputs, session.outputs)
                ) {
                    this.previousSessionStates.set(session.name, {
                        ...prevState,
                        state: session.state,
                        rawState: session.rawState,
                        outputs: session.outputs,
                    });
                    hasChanged = true;
                }
                continue;
            }

            let isTerminated = false;
            if (session.state === "COMPLETED") {
                const prUrl = extractPRUrl(session);
                if (prUrl) {
                    // Use pre-fetched status
                    const isClosed = prStatusMap.get(session.name) ?? false;
                    if (isClosed) {
                        isTerminated = true;
                        console.log(
                            `Jules: Session ${session.name} is now terminated because its PR is closed.`
                        );
                        this.notifiedSessions.delete(session.name);
                    }
                }
            } else if (session.state === "FAILED" || session.state === "CANCELLED") {
                isTerminated = true;
                console.log(
                    `Jules: Session ${session.name} is now terminated due to its state: ${session.state}.`
                );
                this.notifiedSessions.delete(session.name);
            }

            // Check if state actually changed before updating map
            if (
                !prevState ||
                prevState.state !== session.state ||
                prevState.rawState !== session.rawState ||
                prevState.isTerminated !== isTerminated ||
                !areOutputsEqual(prevState.outputs, session.outputs)
            ) {
                this.previousSessionStates.set(session.name, {
                    name: session.name,
                    state: session.state,
                    rawState: session.rawState,
                    outputs: session.outputs,
                    isTerminated: isTerminated,
                });
                hasChanged = true;
            }
        }

        // Persist the updated states to global state ONLY if changed
        if (hasChanged) {
            await this.saveStates();
            console.log(
                `Jules: Saved ${this.previousSessionStates.size} session states to global state.`
            );
        }
        return hasChanged;
    }
}
