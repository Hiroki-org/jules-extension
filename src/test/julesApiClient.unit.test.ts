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

    suite('listAllSources', () => {
        test('should paginate through all sources with pageSize=100', async () => {
            fetchStub.onFirstCall().resolves({
                ok: true,
                json: async () => ({
                    sources: [{ name: 'sources/github-org-repo1' }],
                    nextPageToken: 'token-2'
                })
            });
            fetchStub.onSecondCall().resolves({
                ok: true,
                json: async () => ({
                    sources: [{ name: 'sources/github-org-repo2' }]
                })
            });

            const result = await client.listAllSources();

            assert.strictEqual(fetchStub.callCount, 2);
            const firstUrl = String(fetchStub.firstCall.args[0]);
            const secondUrl = String(fetchStub.secondCall.args[0]);

            assert.ok(firstUrl.includes('/sources?'));
            assert.ok(firstUrl.includes('pageSize=100'));
            assert.ok(!firstUrl.includes('pageToken='));
            assert.ok(secondUrl.includes('pageSize=100'));
            assert.ok(secondUrl.includes('pageToken=token-2'));

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].name, 'sources/github-org-repo1');
            assert.strictEqual(result[1].name, 'sources/github-org-repo2');
        });

        test('should pass filter parameter when provided', async () => {
            fetchStub.resolves({
                ok: true,
                json: async () => ({ sources: [] })
            });

            await client.listAllSources({ filter: 'githubRepo.isPrivate = true' });

            assert.strictEqual(fetchStub.callCount, 1);
            const url = String(fetchStub.firstCall.args[0]);
            assert.ok(url.includes('pageSize=100'));
            assert.ok(url.includes('filter=githubRepo.isPrivate+%3D+true'));
        });
    });
});
