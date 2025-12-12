import * as assert from 'assert';
import * as sinon from 'sinon';
import { JulesApiClient } from '../julesApiClient';

suite('JulesApiClient Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;
    const apiKey = 'test-api-key';
    const baseUrl = 'https://api.example.com';
    let client: JulesApiClient;

    setup(() => {
        sandbox = sinon.createSandbox();
        // @ts-ignore: Stubbing global fetch
        fetchStub = sandbox.stub(global, 'fetch');
        client = new JulesApiClient(apiKey, baseUrl);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('getSource', () => {
        test('should make correct request', async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({ id: 'source-1' })
            };
            fetchStub.resolves(mockResponse);

            const result = await client.getSource('source-1');

            assert.strictEqual(fetchStub.calledOnce, true);
            const [url, options] = fetchStub.firstCall.args;
            assert.strictEqual(url, `${baseUrl}/source-1`);
            assert.strictEqual(options.headers['X-Goog-Api-Key'], apiKey);
            assert.strictEqual(options.headers['Content-Type'], 'application/json');
            assert.deepStrictEqual(result, { id: 'source-1' });
        });

        test('should throw error on API failure', async () => {
            const mockResponse = {
                ok: false,
                status: 404,
                statusText: 'Not Found'
            };
            fetchStub.resolves(mockResponse);

            await assert.rejects(
                client.getSource('invalid-source'),
                new Error('API request failed: 404 Not Found')
            );
        });
    });
});
