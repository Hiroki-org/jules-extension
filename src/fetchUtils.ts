import * as https from 'node:https';
import * as http from 'node:http';
import { SocksProxyAgent } from 'socks-proxy-agent';

let _socksProxyUrl: string | null = null;

export function setSocksProxy(url: string | null): void {
    _socksProxyUrl = url;
}

function normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
    if (!headers) return {};
    if (headers instanceof Headers) return Object.fromEntries(headers.entries());
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    return headers as Record<string, string>;
}

async function fetchViaSocks(
    input: string | URL | Request,
    init: RequestInit & { signal?: AbortSignal },
    proxyUrl: string
): Promise<Response> {
    const urlString = input instanceof Request ? input.url : input.toString();
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const agent = new SocksProxyAgent(proxyUrl);
    const method = (input instanceof Request ? input.method : init?.method) ?? 'GET';
    const headers = normalizeHeaders(init?.headers);
    const body = init?.body;

    return new Promise<Response>((resolve, reject) => {
        const port = url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80);
        const options: https.RequestOptions = {
            hostname: url.hostname,
            port,
            path: url.pathname + url.search,
            method,
            headers,
            agent,
        };

        const transport: typeof https = isHttps ? https : (http as unknown as typeof https);
        const req = transport.request(options, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
                const responseBuffer = Buffer.concat(chunks);
                const responseHeaders: Record<string, string> = {};
                for (const [key, value] of Object.entries(res.headers)) {
                    if (value !== undefined) {
                        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
                    }
                }
                resolve(new Response(responseBuffer, {
                    status: res.statusCode ?? 200,
                    statusText: res.statusMessage ?? '',
                    headers: responseHeaders,
                }));
            });
            res.on('error', reject);
        });

        req.on('error', reject);

        if (init?.signal) {
            init.signal.addEventListener('abort', () => {
                req.destroy();
                reject(new Error('AbortError'));
            }, { once: true });
        }

        if (body) {
            req.write(body as string | Buffer);
        }
        req.end();
    });
}

/**
 * Performs a fetch with a specified timeout.
 * Defaults to 30 seconds.
 */
export async function fetchWithTimeout(input: string | URL | Request, init?: RequestInit & { timeout?: number }): Promise<Response> {
    const timeout = init?.timeout ?? 30000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    let timeoutSignal: AbortSignal;
    // @ts-ignore
    if (typeof AbortSignal.timeout === 'function') {
        // @ts-ignore
        timeoutSignal = AbortSignal.timeout(timeout);
    } else {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(new Error('Timeout')), timeout);
        // Ensure the timer doesn't block the process from exiting if it's supported
        if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof (timer as any).unref === 'function') {
            (timer as any).unref();
        }
        timeoutSignal = controller.signal;
    }

    let finalSignal = timeoutSignal;
    if (init?.signal) {
        finalSignal = anySignal([init.signal, timeoutSignal]);
    }

    try {
        if (_socksProxyUrl) {
            return await fetchViaSocks(input, { ...init, signal: finalSignal }, _socksProxyUrl);
        }
        return await fetch(input, {
            ...init,
            signal: finalSignal
        });
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

/**
 * Polyfill-like helper for AbortSignal.any
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
    // @ts-ignore - AbortSignal.any might not be in the TS definition if target is older
    if (typeof AbortSignal.any === 'function') {
        // @ts-ignore
        return AbortSignal.any(signals);
    }

    const controller = new AbortController();

    const onAbort = (reason: any) => {
        controller.abort(reason);
    };

    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort(signal.reason);
            return controller.signal;
        }
        signal.addEventListener('abort', () => onAbort(signal.reason), { once: true });
    }

    return controller.signal;
}
