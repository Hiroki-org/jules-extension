import * as vscode from 'vscode';

export class GitHubAuth {
    private static readonly SCOPES = ['repo'];

    private static cachedSession: vscode.AuthenticationSession | undefined = undefined;
    private static sessionExpiry: number = 0;
    private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    static async signIn(): Promise<string | undefined> {
        try {
            const session = await vscode.authentication.getSession(
                'github',
                GitHubAuth.SCOPES,
                { createIfNone: true }
            );

            if (session) {
                GitHubAuth.cachedSession = session;
                GitHubAuth.sessionExpiry = Date.now() + GitHubAuth.CACHE_TTL;
            }

            return session?.accessToken;
        } catch (error) {
            vscode.window.showErrorMessage('Failed to sign in to GitHub');
            return undefined;
        }
    }

    static async getSession(): Promise<vscode.AuthenticationSession | undefined> {
        const now = Date.now();
        if (GitHubAuth.cachedSession && now < GitHubAuth.sessionExpiry) {
            return GitHubAuth.cachedSession;
        }

        try {
            const session = await vscode.authentication.getSession(
                'github',
                GitHubAuth.SCOPES,
                { createIfNone: false }
            );

            if (session) {
                GitHubAuth.cachedSession = session;
                GitHubAuth.sessionExpiry = now + GitHubAuth.CACHE_TTL;
            } else {
                GitHubAuth.clearCache();
            }

            return session;
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
        GitHubAuth.cachedSession = undefined;
        GitHubAuth.sessionExpiry = 0;
    }
}
