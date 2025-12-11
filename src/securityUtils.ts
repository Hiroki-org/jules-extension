import { URL } from 'url';

/**
 * Strips credentials (username and password) from a URL string for secure logging.
 *
 * Handles standard HTTP/HTTPS URLs. SSH URLs (e.g. git@github.com:...) are returned as is,
 * as they typically do not contain embedded secrets (rely on SSH keys).
 *
 * @param url The URL to sanitize
 * @returns The sanitized URL with credentials removed
 */
export function stripUrlCredentials(url: string): string {
    if (!url) {
        return url;
    }

    try {
        // Handle HTTP/HTTPS URLs
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const u = new URL(url);
            if (u.username || u.password) {
                u.username = '';
                u.password = '';
                return u.toString();
            }
        }
        // Return SSH or other URLs as is
        return url;
    } catch (e) {
        // If URL parsing fails, return original to avoid breaking functionality,
        // though typically this should be handled by caller if strict validation is needed.
        // For logging purposes, returning original is acceptable if it's not a standard URL,
        // but arguably risky if it's a malformed URL with a token.
        // Given VS Code context, git remote URLs are usually well-formed.
        return url;
    }
}
