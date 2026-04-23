import * as vscode from 'vscode';

export class GitHubAuth {
    private static readonly SCOPES = ['repo'];

    private static cachedSession: vscode.AuthenticationSession | undefined = undefined;
    private static sessionExpiry: number = 0;
    private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private static pendingSessionPromise: Promise<vscode.AuthenticationSession | undefined> | undefined = undefined;
    private static authChangeListenerDisposable: vscode.Disposable | undefined = undefined;
    private static sessionRequestVersion = 0;

    private static ensureAuthSessionListener(): void {
        if (GitHubAuth.authChangeListenerDisposable) {
            return;
        }

        const onDidChangeSessions = (vscode.authentication as unknown as {
            onDidChangeSessions?: (listener: (event: unknown) => void) => vscode.Disposable;
        }).onDidChangeSessions;

        if (typeof onDidChangeSessions !== 'function') {
            return;
        }

        GitHubAuth.authChangeListenerDisposable = onDidChangeSessions((event: unknown) => {
            const providerId = (event as { provider?: { id?: string } }).provider?.id;
            if (providerId && providerId !== 'github') {
                return;
            }
            GitHubAuth.clearCache();
        });
    }

    private static cacheSession(
        session: vscode.AuthenticationSession,
        requestVersion: number
    ): void {
        if (requestVersion !== GitHubAuth.sessionRequestVersion) {
            return;
        }

        GitHubAuth.cachedSession = session;
        GitHubAuth.sessionExpiry = Date.now() + GitHubAuth.CACHE_TTL;
    }

    static async signIn(): Promise<string | undefined> {
        GitHubAuth.ensureAuthSessionListener();
        GitHubAuth.clearCache();
        const requestVersion = GitHubAuth.sessionRequestVersion;

        try {
            const session = await vscode.authentication.getSession(
                'github',
                GitHubAuth.SCOPES,
                { createIfNone: true }
            );

            if (session) {
                GitHubAuth.cacheSession(session, requestVersion);
            } else {
                GitHubAuth.clearCache();
            }

            return session?.accessToken;
        } catch (error) {
            GitHubAuth.clearCache();
            vscode.window.showErrorMessage('Failed to sign in to GitHub');
            return undefined;
        }
    }

    static async getSession(): Promise<vscode.AuthenticationSession | undefined> {
        GitHubAuth.ensureAuthSessionListener();

        const now = Date.now();
        if (GitHubAuth.cachedSession && now < GitHubAuth.sessionExpiry) {
            return GitHubAuth.cachedSession;
        }

        if (GitHubAuth.pendingSessionPromise) {
            return GitHubAuth.pendingSessionPromise;
        }

        const requestVersion = GitHubAuth.sessionRequestVersion;
        const promise = (GitHubAuth.pendingSessionPromise = Promise.resolve(vscode.authentication.getSession(
            'github',
            GitHubAuth.SCOPES,
            { createIfNone: false }
        )).then((session) => {
            if (session) {
                GitHubAuth.cacheSession(session, requestVersion);
            } else {
                GitHubAuth.clearCache();
            }

            return session;
        }).catch((error) => {
            GitHubAuth.clearCache();
            return undefined;
        }).finally(() => {
            if (GitHubAuth.pendingSessionPromise === promise) {
                GitHubAuth.pendingSessionPromise = undefined;
            }
        }));

        try {
            return await promise;
        } catch (error) {
            GitHubAuth.clearCache();
            return undefined;
        }
    }

    static async getToken(): Promise<string | undefined> {
        const session = await GitHubAuth.getSession();
        return session?.accessToken;
    }

    static async getUserInfo(): Promise<{ login: string; name: string } | undefined> {
        const session = await GitHubAuth.getSession();
        if (!session) {
            return undefined;
        }

        return {
            login: session.account.label,
            name: session.account.label
        };
    }

    static async isSignedIn(): Promise<boolean> {
        const session = await GitHubAuth.getSession();
        return session !== undefined;
    }

    static clearCache(): void {
        GitHubAuth.sessionRequestVersion += 1;
        GitHubAuth.cachedSession = undefined;
        GitHubAuth.sessionExpiry = 0;
        GitHubAuth.pendingSessionPromise = undefined;
    }

    static dispose(): void {
        if (GitHubAuth.authChangeListenerDisposable) {
            GitHubAuth.authChangeListenerDisposable.dispose();
            GitHubAuth.authChangeListenerDisposable = undefined;
        }
        GitHubAuth.clearCache();
    }
}
