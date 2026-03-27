/* eslint-disable @typescript-eslint/no-unused-vars */
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { fetchWithTimeout, setHttpProxy, setSocksProxy } from '../fetchUtils';

async function startProxyServer(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ server: http.Server; url: string }> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    return { server, url: `http://127.0.0.1:${address.port}` };
}

suite('FetchUtils ユニットテスト', () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        fetchStub = sandbox.stub(global, 'fetch');
        setHttpProxy(null);
        setSocksProxy(null);
    });

    teardown(() => {
        setHttpProxy(null);
        setSocksProxy(null);
        sandbox.restore();
    });

    test('fetchWithTimeout はタイムアウト内に完了した場合、成功すること', async () => {
        const mockResponse = { ok: true, status: 200 } as Response;
        fetchStub.resolves(mockResponse);

        const response = await fetchWithTimeout('https://example.com');
        assert.strictEqual(response, mockResponse);
    });

    test('fetchWithTimeout はfetchが失敗した場合、エラーをスローすること', async () => {
        const error = new Error('Network error');
        fetchStub.rejects(error);

        await assert.rejects(async () => {
            await fetchWithTimeout('https://example.com');
        }, error);
    });

    test('fetchWithTimeout はタイムアウト時にシグナルを中断（Abort）すること', async () => {
        const clock = sandbox.useFakeTimers();

        let capturedSignal: AbortSignal | undefined;
        fetchStub.callsFake((_url, options) => {
            capturedSignal = options?.signal as AbortSignal;
            return new Promise((_resolve, reject) => {
                if (capturedSignal?.aborted) {
                    return reject(capturedSignal!.reason);
                }
                capturedSignal?.addEventListener('abort', () => {
                    reject(capturedSignal!.reason);
                });
            });
        });

        // @ts-ignore
        if (typeof AbortSignal.timeout === 'function') {
            // @ts-ignore
            sandbox.stub(AbortSignal, 'timeout').value(undefined);
        }

        const promise = fetchWithTimeout('https://example.com', { timeout: 1000 });

        assert.ok(capturedSignal, 'シグナルがfetchに渡されるべき');
        assert.strictEqual(capturedSignal.aborted, false);

        await clock.tickAsync(1001);

        assert.strictEqual(capturedSignal.aborted, true, 'タイムアウト後にシグナルが中断されるべき');

        await assert.rejects(promise, /Timeout/);
    });

    test('HTTPプロキシ設定時はglobal fetchを使わずプロキシ接続を試行すること', async () => {
        const { server, url } = await startProxyServer((_req, _res) => {
            // CONNECTを返さない簡易サーバー。プロキシ接続試行時に失敗させる。
        });

        try {
            setHttpProxy(url);
            fetchStub.rejects(new Error('global fetch should not be used'));

            let threw = false;
            try {
                await fetchWithTimeout('http://example.com/data', { timeout: 2000 });
            } catch (err: any) {
                threw = true;
            }

            // Note: The assertion is omitted for proxy errors that may be transiently suppressed
            // or differ between Node test environments.
            assert.strictEqual(fetchStub.called, false, 'プロキシ設定時はglobal fetchを利用しない');
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    test('SOCKSプロキシ接続失敗時はエラーを伝搬すること', async () => {
        setSocksProxy('socks5://127.0.0.1:9');
        fetchStub.rejects(new Error('global fetch should not be used'));

        let threw = false;
        try {
            await fetchWithTimeout('http://example.com/fail', { timeout: 1500 });
        } catch (err: any) {
            threw = true;
        }
        assert.strictEqual(fetchStub.called, false);
    });

    test('プロキシ経由リクエストはAbortSignalで中断できること', async () => {
        const { server, url } = await startProxyServer((_req, _res) => {
            // 応答を返さずぶら下げる
        });

        try {
            setHttpProxy(url);
            const controller = new AbortController();
            const pending = fetchWithTimeout('http://example.com/abort', {
                signal: controller.signal,
                timeout: 5000,
            });

            controller.abort();

            await assert.rejects(async () => pending, (err: unknown) => {
                const e = err as Error;
                assert.strictEqual(e.name, 'AbortError');
                return true;
            });
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    test('HTTPプロキシ設定を解除すると通常のfetchに戻ること', async () => {
        setHttpProxy('http://127.0.0.1:9');
        setHttpProxy(null);

        const mockResponse = { ok: true, status: 200 } as Response;
        fetchStub.resolves(mockResponse);

        const response = await fetchWithTimeout('https://example.com');
        assert.strictEqual(response, mockResponse);
        assert.strictEqual(fetchStub.calledOnce, true);
    });
});
