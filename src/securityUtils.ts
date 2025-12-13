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
        // If URL parsing fails, try to strip credentials using regex for http/https
        // This is a fallback to prevent leaking credentials in logs when URL is malformed
        if (url.startsWith('http://') || url.startsWith('https://')) {
            // Regex matches protocol (group 1) and any userinfo ending with @ (group 2)
            // It uses a greedy match for userinfo but bounded by /, ? or # to ensure we don't cross into path
            return url.replace(/^(https?:\/\/)([^/?#]+@)/, '$1');
        }

        // Return SSH or other URLs as is
        return url;
    }
}
