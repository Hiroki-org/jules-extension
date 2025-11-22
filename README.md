# Jules Extension for VSCode

[![VSCode Extension](httpshttps://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)]
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "Google Jules と共に、未来のコーディングをVSCodeで体験しよう"

Jules Extensionは、GoogleのAIコーディングエージェント **Jules** をVSCodeから直接操作するための拡張機能です。
あなたのコーディングワークフローに、知的なパートナーを迎え入れましょう。

## ✨ コンセプト

この拡張機能は、あなたの開発体験を次のレベルへと引き上げるために作られました。

- **シームレスな統合:** 使い慣れたVSCode環境を離れることなく、Julesの強力な機能にアクセスできます。
- **リアルタイムな連携:** コーディングセッションの作成から進捗の確認まで、すべてがリアルタイムで行えます。
- **生産性の飛躍:** 面倒な作業はJulesに任せ、あなたは創造的な仕事に集中できます。

## 🚀 主な機能

| 機能 | 説明 | コマンド / アイコン |
| :--- | :--- | :--- |
| **APIキー設定** | 初回利用時にAPIキーを設定し、Julesアカウントに接続します。キーはVSCodeのSecretStorageに安全に保管され、以降のリクエストで自動的に使用されます。 | `Set Jules API Key` / `$(key)` |
| **APIキー検証** | API接続をテストし、キーが有効であることを確認します。 | `Verify Jules API Key` |
| **ソース一覧** | Julesが利用可能なデータソースを閲覧します。 | `List Jules Sources` / `$(repo)` |
| **セッション管理** | `Create Jules Session`コマンドで、新しいコーディングタスクをJulesに割り当てます。過去のセッションも一覧表示され、いつでも作業を再開したり、完了したタスクの履歴を確認したりできます。 | `Create Jules Session` / `$(add)` |
| **リアルタイム監視** | Julesの現在の作業状況（`Running`, `Active`, `Done`など）を、専用のサイドバービューで一目で確認できます。 | `julesSessionsView` / `$(robot)` |
| **進捗更新** | Julesの進捗が気になったら、`↻`（更新）ボタンをクリックするだけで、最新のセッション状況とアクティビティリストを即座に取得・表示します。 | `Refresh Jules Sessions` / `$(refresh)` |
| **アクティビティ表示** | セッションを選択すると、Julesが実行したコマンド、編集したファイル、その思考プロセスなどの詳細なログを確認できます。 | `Show Jules Activities` |
| **アクティビティ更新** | 現在のセッションのアクティビティビューを更新し、最新の進捗を確認します。 | `Refresh Jules Activities` / `$(refresh)` |
| **メッセージ送信** | 実行中のJulesセッションにフォローアップメッセージを送信し、追加の指示やフィードバックを与えます。 | `Send Message to Jules Session` |
| **計画承認** | Julesが生成した実行計画を確認し、承認します。 | `Approve Jules Plan` / `$(check)` |
| **設定を開く** | Jules拡張機能に関連する設定画面を開きます。 | `Open Jules Settings` / `$(settings-gear)` |
| **セッション削除** | ローカルキャッシュからセッションを削除します。 | `Delete Session from Local Cache` / `$(trash)` |
| **キャッシュクリア** | Jules拡張機能のキャッシュをすべて消去します。 | `Clear Jules Cache` / `$(clear-all)` |

## 📦 インストール

[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)からインストールしてください。

または、VS Codeの拡張機能ビューで "Jules Extension" を検索してください。

### Marketplaceから (推奨)

1. VSCodeのMarketplaceで "Jules Extension" を検索
2. `インストール` ボタンをクリック

### VSIXファイルから (手動インストール)

まだMarketplaceに公開されていない最新の機能を試したい場合は、リリースページから`.vsix`ファイルを直接ダウンロードしてインストールできます。

1. **リリースページに移動:**
   [GitHub Releases](https://github.com/is0692vs/jules-extension/releases) にアクセスし、最新のリリースバージョンを見つけます。

2. **VSIXファイルをダウンロード:**
   `Assets` から `.vsix` ファイル（例: `jules-extension-1.1.1.vsix`）をダウンロードします。

3. **VSCodeにインストール:**
   - VSCodeを開きます。
   - `拡張機能` ビュー (`Ctrl+Shift+X`) に移動します。
   - ビューの上部にある `...` (その他のアクション) メニューをクリックし、`VSIXからのインストール...` を選択します。
   - ダウンロードした `.vsix` ファイルを選択してインストールします。

## 🔑 APIキーの取得

Jules Extensionを使用するには、JulesのAPIキーが必要です。以下の手順で取得してください。

1. **アカウント作成:**
   - [Jules公式サイト](https://jules.google/docs)にアクセスします。
   - 新規アカウントを登録するか、既にお持ちの場合はログインします。

2. **APIキーの生成:**
   - アカウントダッシュボードの「APIキー」または「開発者設定」セクションに移動します。
   - 「新しいシークレットキーを作成」をクリックします。
   - キーに分かりやすい名前（例: "VSCode Extension"）を付けて生成します。

3. **キーのコピー:**
   - 新しいAPIキーが表示されます。クリップボードにコピーしてください。
   - 後で再度キーを確認する必要がある場合でも、Julesの設定ページでいつでも確認できます。

> **重要:** APIキーはパスワードのように扱ってください。公に共有したり、バージョン管理にコミットしたりしないでください。

## 認証

### GitHub OAuth サインイン (推奨) ✅

`Jules: Sign in to GitHub` コマンドを使用してください。

**使い方:**

1. コマンドパレット (`Cmd+Shift+P`) を開きます。
2. `Jules: Sign in to GitHub` を実行します。
3. ブラウザで認証を許可します。

---

### GitHub PAT (非推奨) ⚠️

**PAT（Personal Access Token）による認証は非推奨となり、将来のバージョンで削除される予定です。**

OAuthサインインへの移行をお願いします。

## ⚙️ 拡張機能の設定

この拡張機能は、以下の設定項目を提供します:

- `jules-extension.apiKey`: Jules APIの認証用APIキー（SecretStorageに安全に保管されます）
- `jules-extension.autoRefresh.enabled`: セッションリストの自動更新を有効にするか（デフォルト: `false`）
- `jules-extension.autoRefresh.interval`: 自動更新の間隔（秒）（デフォルト: `30`, 最小: `10`）
- `jules-extension.customPrompt`: Julesへの全メッセージの先頭に自動的に付与されるカスタムプロンプト
- `jules-extension.hideClosedPRSessions`: クローズまたはマージされたプルリクエストを持つセッションを自動的に非表示にするか（デフォルト: `true`）
- `jules.defaultBranch`: セッション作成時のデフォルトブランチ選択挙動（`current`, `default`, `main`から選択）

## クイックスタート

1. `Ctrl + Shift + P` (`Cmd + Shift + P`) でコマンドパレットを開きます。
2. `> Jules: Set Jules API Key` を実行し、APIキーを入力します。
3. サイドバーの `$(robot)` アイコンをクリックして、Julesセッションビューを開きます。
4. `> Jules: Create Jules Session` を実行して、最初のコーディングセッションを開始しましょう！

## ⚠️ 注意事項

- **カードブロックのレンダリング:** カードブロックとして表示される機能を使用する際、コンテンツの構造によっては正しくレンダリングされない可能性があるためご注意ください。

## 全コマンド一覧

- `Jules: Set Jules API Key` - API認証情報を設定します
- `Jules: Verify Jules API Key` - API接続をテストします
- `Jules: List Jules Sources` - 利用可能なソースを閲覧します
- `Jules: Create Jules Session` - 新しい分析セッションを開始します
- `Jules: Refresh Jules Sessions` - セッションリストを再読み込みします
- `Jules: Show Jules Activities` - セッションのアクティビティを表示します
- `Jules: Refresh Jules Activities` - アクティビティビューを更新します
- `Jules: Send Message to Jules Session` - 実行中のセッションに指示を送信します
- `Jules: Approve Jules Plan` - 生成された計画の実行を承認します
- `Jules: Open Jules Settings` - 設定画面を開きます
- `Jules: Delete Session from Local Cache` - ローカルキャッシュからセッションを削除します
- `Jules: Set GitHub Token (for PR Status)` - GitHubトークンを設定します（PRステータス確認用）
- `Jules: Clear Jules Cache` - Julesのキャッシュをクリアします
- `Jules: Sign in to GitHub` - GitHubにサインインします
- `Jules: [DEPRECATED] Set GitHub PAT` - GitHub PATを設定します（非推奨）


## 📚 リンク

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHub Repository](https://github.com/is0692vs/jules-extension.git)
- [Report Issues](https://github.com/is0692vs/jules-extension/issues)

## 🤝 コントリビューション

このプロジェクトはまだ始まったばかりです。バグ報告、機能提案、プルリクエストなど、あらゆる形の貢献を歓迎します！
Issue TrackerやPull Requestsをご確認ください。

## 📝 ライセンス

[MIT](LICENSE)
