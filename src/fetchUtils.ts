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
