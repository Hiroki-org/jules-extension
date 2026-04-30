import * as assert from 'assert';
import { JULES_API_BASE_URL, ALL_SOURCES_ID } from '../julesApiConstants';

suite('julesApiConstants Unit Tests', () => {
    test('JULES_API_BASE_URL should be correctly defined', () => {
        assert.strictEqual(JULES_API_BASE_URL, 'https://jules.googleapis.com/v1alpha');
    });

    test('ALL_SOURCES_ID should be correctly defined', () => {
        assert.strictEqual(ALL_SOURCES_ID, 'all_repos');
    });
});
