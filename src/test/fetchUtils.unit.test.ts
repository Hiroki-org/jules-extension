import * as assert from 'assert';
import * as sinon from 'sinon';
import { fetchWithTimeout } from '../fetchUtils';

suite('fetchUtils Unit Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;
    let clock: sinon.SinonFakeTimers;
    let originalAbortSignalTimeout: any;

    setup(() => {
        sandbox = sinon.createSandbox();
        clock = sandbox.useFakeTimers();
        fetchStub = sandbox.stub(global, 'fetch');

        const signalAsAny = AbortSignal as any;
        if (typeof signalAsAny.timeout === 'function') {
            originalAbortSignalTimeout = signalAsAny.timeout;
            // テストのデフォルトではネイティブ実装を無効化してsetTimeoutパスをテストする
            signalAsAny.timeout = undefined;
        }
    });

    teardown(() => {
        if (originalAbortSignalTimeout) {
            (AbortSignal as any).timeout = originalAbortSignalTimeout;
        }
        sandbox.restore();
    });

    // AbortSignal に反応する fetch のモックを作成するヘルパー
    const mockFetchWithSignalSupport = () => {
        fetchStub.callsFake((_input, init) => {
            return new Promise((_, reject) => {
                const signal = init?.signal as AbortSignal;
                if (signal) {
                    if (signal.aborted) {
                        reject(signal.reason);
                    } else {
                        signal.addEventListener('abort', () => reject(signal.reason));
                    }
                }
                // signalがない、またはabortされない場合は永遠に解決しない（タイムアウト待ち）
            });
        });
    };

    test('指定時間内にフェッチが成功すること', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            json: async () => ({ data: 'test' }),
            headers: new Headers()
        } as unknown as Response;

        fetchStub.resolves(mockResponse);

        const promise = fetchWithTimeout('https://example.com', { timeout: 5000 });

        // 即座に解決させる
        await promise;

        assert.strictEqual(fetchStub.calledOnce, true);
    });

    test('タイムアウト時にエラーがスローされること (setTimeout使用)', async () => {
        mockFetchWithSignalSupport();

        const promise = fetchWithTimeout('https://example.com', { timeout: 1000 });

        // タイムアウト時間を経過させる
        await clock.tickAsync(1100);

        await assert.rejects(promise, (err: Error) => {
            assert.match(err.message, /Timeout/);
            return true;
        });
    });

    test('外部AbortSignalで中断できること', async () => {
        mockFetchWithSignalSupport();

        const controller = new AbortController();
        const promise = fetchWithTimeout('https://example.com', {
            timeout: 5000,
            signal: controller.signal
        });

        // 外部からアボート
        controller.abort(new Error('User cancelled'));

        await assert.rejects(promise, (err: Error) => {
            assert.strictEqual(err.message, 'User cancelled');
            return true;
        });
    });

    test('デフォルトのタイムアウト（30秒）が適用されること', async () => {
        mockFetchWithSignalSupport();

        const promise = fetchWithTimeout('https://example.com'); // timeout指定なし

        // 31秒経過させる
        await clock.tickAsync(31000);

        await assert.rejects(promise, (err: Error) => {
            assert.match(err.message, /Timeout/);
            return true;
        });
    });

    test('AbortSignal.timeout が利用可能な場合に使用されること', async () => {
        // このテストケース用にネイティブ実装（のモック）を有効化
        const timeoutSpy = sandbox.spy();
        (AbortSignal as any).timeout = (ms: number) => {
            timeoutSpy(ms);
            // 簡易的なシグナルを返す
            const controller = new AbortController();
            // 実際にタイムアウトさせるにはclockを進める必要があるが、
            // ここでは関数が呼ばれたかどうかを確認する
            return controller.signal;
        };

        mockFetchWithSignalSupport();

        const promise = fetchWithTimeout('https://example.com', { timeout: 1234 });

        // プロミスは解決しないので待たない（テスト終了時にクリーンアップされる）
        // AbortSignal.timeout が呼ばれたことを確認
        assert.strictEqual(timeoutSpy.calledWith(1234), true);

        // キャッチされないプロミスエラーを防ぐためにcatchを追加
        promise.catch(() => {});
    });
});
