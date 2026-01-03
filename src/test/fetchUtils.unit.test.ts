/* eslint-disable @typescript-eslint/no-unused-vars */
import * as assert from 'assert';
import * as sinon from 'sinon';
import { fetchWithTimeout } from '../fetchUtils';

suite('FetchUtils ユニットテスト', () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        fetchStub = sandbox.stub(global, 'fetch');
    });

    teardown(() => {
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

        // シグナルをキャプチャし、ハングアップするfetchをモックする
        let capturedSignal: AbortSignal | undefined;
        fetchStub.callsFake((url, options) => {
            capturedSignal = options?.signal as AbortSignal;
            return new Promise((_resolve, reject) => {
                 // 即座に中断されているかチェック
                 if (capturedSignal?.aborted) {
                     return reject(capturedSignal!.reason);
                 }
                 // 将来の中断をリッスン
                 capturedSignal?.addEventListener('abort', () => {
                     reject(capturedSignal!.reason);
                 });
            });
        });

        // AbortSignal.timeoutが存在する場合、Sinonの偽タイマーと連動しない可能性があるため、
        // フォールバックパス（setTimeoutを使用するパス）を強制するためにスタブ化する。
        // @ts-ignore
        if (typeof AbortSignal.timeout === 'function') {
             // @ts-ignore
             sandbox.stub(AbortSignal, 'timeout').value(undefined);
        }

        const promise = fetchWithTimeout('https://example.com', { timeout: 1000 });

        assert.ok(capturedSignal, 'シグナルがfetchに渡されるべき');
        assert.strictEqual(capturedSignal.aborted, false);

        // 時間を進める
        await clock.tickAsync(1001);

        assert.strictEqual(capturedSignal.aborted, true, 'タイムアウト後にシグナルが中断されるべき');

        await assert.rejects(promise, /Timeout/);
    });
});
