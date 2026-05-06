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

/**
 * Sanitizes a string for safe logging by escaping control characters and limiting length.
 * This prevents log injection attacks and log flooding.
 *
 * @param value The value to sanitize
 * @param maxLength Maximum length of the string (default: 500)
 * @returns Sanitized string
 */
export function sanitizeForLogging(value: unknown, maxLength: number = 500): string {
    if (value === null || value === undefined) {
        return String(value);
    }

    // Convert to string in case it's not
    let str = stripAnsiEscapeSequences(String(value));

    // Truncate if too long, ensuring the result is not longer than maxLength
    if (str.length > maxLength) {
        if (maxLength < 4) { // Not enough space for '...'
            str = str.substring(0, maxLength);
        } else {
            str = str.substring(0, maxLength - 3) + '...';
        }
    }

    // Replace control characters
    // \n -> \n, \r -> \r, \t -> \t
    return str
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        // Remove other non-printable characters (except basic ASCII printable)
        // \x00-\x08, \x0B-\x0C, \x0E-\x1F, \x7F
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function stripAnsiEscapeSequences(value: string): string {
    let result = '';

    for (let i = 0; i < value.length; i += 1) {
        if (value.charCodeAt(i) !== 0x1B) {
            result += value[i];
            continue;
        }

        const next = value[i + 1];
        if (!next) {
            continue;
        }

        if (next === ']') {
            i += 2;
            while (i < value.length) {
                if (value.charCodeAt(i) === 0x07) {
                    break;
                }
                if (value.charCodeAt(i) === 0x1B && value[i + 1] === '\\') {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        if (next === '[') {
            i += 2;
            while (i < value.length) {
                const code = value.charCodeAt(i);
                if (code >= 0x40 && code <= 0x7E) {
                    break;
                }
                i += 1;
            }
            continue;
        }

        const nextCode = next.charCodeAt(0);
        if (nextCode >= 0x40 && nextCode <= 0x5F) {
            i += 1;
        }
    }
    return result;
}

/**
 * Validates a session ID to ensure it is safe to use in a URL path.
 * Allows alphanumeric characters, hyphens, underscores, and forward slashes.
 * Explicitly rejects any path traversal attempts (..) or other special characters.
 *
 * @param sessionId The session ID to validate
 * @returns true if the session ID is valid, false otherwise
 */
export function isValidSessionId(sessionId: string): boolean {
    if (!sessionId || typeof sessionId !== 'string') {
        return false;
    }

    // Allow only alphanumeric, slashes, dashes, and underscores
    // This supports formats like "sessions/123" or "projects/foo/locations/bar/sessions/baz"
    const allowedPattern = /^[a-zA-Z0-9_\-\/]+$/;
    return allowedPattern.test(sessionId);
}
