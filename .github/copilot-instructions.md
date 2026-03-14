---
description: "Jules Extension – VS Code extension for operating Google Jules. TypeScript project with esbuild bundling and Mocha unit tests."
applyTo: "**"
---

# Jules Extension – Copilot Instructions

**Jules Extension** は、Google Jules のセッション作成・進捗確認・メッセージ送信・PR関連操作を VS Code から実行するための拡張機能です。

## Quick Reference

| Component            | Tech / Role                          | Location                |
| -------------------- | ------------------------------------ | ----------------------- |
| Extension Entry      | VS Code Extension Activation         | `src/extension.ts`      |
| Chat View            | Webview HTML + UI interactions       | `src/chatView.ts`       |
| API Client           | Jules API 呼び出し                    | `src/julesApiClient.ts` |
| Session Artifacts    | diff/changeset 抽出とキャッシュ         | `src/sessionArtifacts.ts` |
| Tests                | Mocha (TDD), TypeScript test sources | `src/test/*.test.ts`    |
| Build Output         | Extension bundle                     | `dist/`                 |
| Compiled Test Output | Unit test 実行用 JS                   | `out/test/`             |

---

## Core Commands

```bash
# 型チェック + lint + バンドル
npm run compile

# 型チェックのみ
npm run check-types

# lint
npm run lint

# ユニットテスト（Mocha）
npm run test:unit

# 開発用ウォッチ（esbuild + tsc）
npm run watch

# テストコードのコンパイル
npm run compile-tests
```

---

## Project Structure

```text
src/
├── extension.ts              # エントリポイント（コマンド登録/全体制御）
├── chatView.ts               # Chat webview の描画とイベント処理
├── julesApiClient.ts         # Jules API クライアント
├── sessionArtifacts.ts       # Activity/changeset 解析
├── sessionContextMenu*.ts    # PR/ブランチ関連コンテキストメニュー
├── securityUtils.ts          # ログやURLのサニタイズ
└── test/                     # unit tests
```

---

## Development Workflow

### New Work

1. 新しいブランチを作成:

   ```bash
   git checkout -b feature/<short-topic>
   ```

2. 実装 + 必要なテスト追加
3. 事前検証:

   ```bash
   npm run compile && npm run test:unit
   ```

4. Push して PR 作成

### Existing PR Improvements

1. 対象 PR のブランチを checkout:

   ```bash
   gh pr checkout <PR#>
   ```

2. 修正 + テスト
3. commit / push
4. レビュー・CI 対応

---

## PR Consolidation Rules (重要)

類似PRを統合する場合は、**必ず既存PRに集約**し、統合専用の新規PRは作らないこと。

### 必須手順

1. 類似PRを変更ファイル・目的・レビュー状態でグルーピングする
2. グループごとに **統合先PRを1つ**決める（既存PRのみ）
3. 統合元ブランチを統合先ブランチへ取り込む:

   ```bash
   gh pr checkout <target-pr>
   git merge --no-ff origin/<source-branch>
   ```

4. 統合後の `main` 差分を基準に、統合先PRのタイトル/説明を更新する
5. 統合先PR本文に、取り込んだ元PR（`#123` 形式）を明記する
6. 統合元PRには `gh` で「統合先に集約するためクローズ」のコメントを残して閉じる:

   ```bash
   gh pr comment <source-pr> --body "このPRは #<target-pr> に統合するためクローズします。以降の議論は #<target-pr> に集約します。"
   gh pr close <source-pr>
   ```

7. 取り込み対象PRの未対応レビューのうち、妥当な指摘は必ず反映する

---

## Review Response Workflow

PRレビューコメント（Conversation）対応時は次を徹底:

1. 全レビュー会話を取得:

   ```bash
   gh pr view <PR#> --json reviews
   ```

2. 各指摘に対し、採用または見送りを明確に返信
3. 見送り時は理由を明記し、必要なら追跡Issueを添付
4. 最終的に未解決スレッドが残っていないことを確認（`isResolved=false` が 0）

---

## CI Confirmation Loop (必須)

push 後は必ず以下のループを実施:

```bash
sleep 300 && gh pr checks <PR#>
```

- 失敗があればログ確認:

  ```bash
  gh pr checks <PR#> --watch
  ```

- 修正して再 push 後、再度 `sleep 300 && gh pr checks <PR#>` を実施
- **レビュー対応完了 + CI成功 + 承認** が揃ってからマージ判断

---

## Useful Paths

- Extension entry: `src/extension.ts`
- Chat webview: `src/chatView.ts`
- Session artifacts: `src/sessionArtifacts.ts`
- API client: `src/julesApiClient.ts`
- Unit tests: `src/test/*.test.ts`
- Build config: `esbuild.js`
- CI workflow: `.github/workflows/ci.yml`

---

## Notes for Agents

- まず `.github/copilot-instructions.md` を読む
- 変更後は最低限 `npm run compile && npm run test:unit` を実行
- VS Code 拡張の動作確認は `F5`（Extension Development Host）
- 既存PR改善では、対象PRブランチへ直接修正を積む（新PRを増やさない）
