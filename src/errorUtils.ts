
import { sanitizeForLogging } from './securityUtils';

/**
 * Sanitizes an error object for safe logging.
 * Preserves the message and stack trace (if available) but sanitizes them to prevent log injection.
 *
 * @param error The error object or unknown value
 * @returns A sanitized string representation of the error
 */
export function sanitizeError(error: unknown): string {
    if (error instanceof Error) {
        const message = sanitizeForLogging(error.message);
        const stack = error.stack ?
            '\n' + error.stack.split('\n').map(line => sanitizeForLogging(line)).join('\n') :
            '';
        return `${message}${stack}`;
    }
    return sanitizeForLogging(String(error));
}
