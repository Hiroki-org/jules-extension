import * as assert from 'assert';
import { Source } from '../types';

suite('Types Test Suite', () => {
    suite('Source Type', () => {
        test('should accept isPrivate field as true', () => {
            const privateSource: Source = {
                name: 'sources/github/owner/private-repo',
                id: 'owner/private-repo',
                isPrivate: true
            };

            assert.strictEqual(privateSource.isPrivate, true);
            assert.strictEqual(privateSource.name, 'sources/github/owner/private-repo');
        });

        test('should accept isPrivate field as false', () => {
            const publicSource: Source = {
                name: 'sources/github/owner/public-repo',
                id: 'owner/public-repo',
                isPrivate: false
            };

            assert.strictEqual(publicSource.isPrivate, false);
            assert.strictEqual(publicSource.name, 'sources/github/owner/public-repo');
        });

        test('should accept Source without isPrivate field (optional)', () => {
            const source: Source = {
                name: 'sources/github/owner/repo',
                id: 'owner/repo'
            };

            assert.strictEqual(source.isPrivate, undefined);
            assert.strictEqual(source.name, 'sources/github/owner/repo');
        });

        test('should work with all Source fields', () => {
            const fullSource: Source = {
                name: 'sources/github/owner/private-repo',
                id: 'owner/private-repo',
                url: 'https://github.com/owner/private-repo',
                description: 'A private repository',
                isPrivate: true,
                githubRepo: {
                    owner: 'owner',
                    repo: 'private-repo',
                    isPrivate: true,
                    defaultBranch: { displayName: 'main' },
                    branches: [
                        { displayName: 'main' },
                        { displayName: 'develop' }
                    ]
                }
            };

            assert.strictEqual(fullSource.isPrivate, true);
            assert.strictEqual(fullSource.description, 'A private repository');
            assert.strictEqual(fullSource.githubRepo?.isPrivate, true);
        });
    });
});
