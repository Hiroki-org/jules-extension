import * as assert from 'assert';
import { parseGitHubUrl } from '../githubUtils';

suite('githubUtils Unit Tests', () => {
    const testCases: Array<{ name: string; url: string; expected: { owner: string; repo: string } | null }> = [
        // 正常系: HTTPS
        { name: 'HTTPS URL を正しくパースできること (末尾 .git なし)', url: 'https://github.com/owner/repo', expected: { owner: 'owner', repo: 'repo' } },
        { name: 'HTTPS URL を正しくパースできること (末尾 .git あり)', url: 'https://github.com/owner/repo.git', expected: { owner: 'owner', repo: 'repo' } },

        // 正常系: SSH
        { name: 'SSH URL を正しくパースできること', url: 'git@github.com:owner/repo.git', expected: { owner: 'owner', repo: 'repo' } },

        // 正常系: 特殊文字を含むリポジトリ名
        { name: 'ドットを含むリポジトリ名を正しくパースできること', url: 'https://github.com/owner/my.repo.git', expected: { owner: 'owner', repo: 'my.repo' } },
        { name: 'ハイフンを含むオーナー名とリポジトリ名を正しくパースできること', url: 'https://github.com/my-owner/my-repo.git', expected: { owner: 'my-owner', repo: 'my-repo' } },

        // 異常系: 無効なドメイン
        { name: '無効なドメインの URL は null を返すこと', url: 'https://gitlab.com/owner/repo.git', expected: null },

        // 異常系: サポート外のホスト
        { name: 'GitHub 以外のホスト (Enterprise 等) は現状の正規表現ではサポート外であること', url: 'https://github.mycompany.com/owner/repo.git', expected: null },

        // 異常系: パス不足
        { name: 'パスが不足している URL は null を返すこと', url: 'https://github.com/owner', expected: null },

        // エッジケースの現状確認テスト
        // 注意: 以下のケースは将来的に修正される可能性があるが、現在の実装動作を固定化するために記述している。

        // 末尾スラッシュ: 現状は null を返す (マッチしない)
        { name: '末尾にスラッシュがある場合は null (または現状の動作) を返すこと', url: 'https://github.com/owner/repo/', expected: null },

        // クエリストリング: 現状は repo 名に含まれてしまう
        { name: 'クエリストリングが含まれる場合、現状はrepo名に含まれてしまう', url: 'https://github.com/owner/repo?foo=bar', expected: { owner: 'owner', repo: 'repo?foo=bar' } },

        // フラグメント: 現状は repo 名に含まれてしまう
        { name: 'フラグメントが含まれる場合、現状はrepo名に含まれてしまう', url: 'https://github.com/owner/repo#readme', expected: { owner: 'owner', repo: 'repo#readme' } },

        // HTTPS (http)
        { name: 'HTTP URL を正しくパースできること', url: 'http://github.com/owner/repo.git', expected: { owner: 'owner', repo: 'repo' } },
    ];

    for (const { name, url, expected } of testCases) {
        test(name, () => {
            const result = parseGitHubUrl(url);
            assert.deepStrictEqual(result, expected);
        });
    }
});
