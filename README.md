# Jules Extension for VSCode

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)]
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "Google Julesと共に、未来のコーディングをVSCodeで体験しよう"

Jules Extensionは、GoogleのAIコーディングエージェント**Jules**を、VSCode内から直接操作できるようにする拡張機能です。
あなたのコーディングワークフローに、知的なパートナーを迎え入れましょう。

## ✨ コンセプト

この拡張機能は、あなたの開発体験を次のレベルへと引き上げるために作成されました。

- **シームレスな統合:** 使い慣れたVSCode環境を離れることなく、Julesの強力な機能にアクセスできます。
- **リアルタイムな連携:** コーディングセッションの作成から進捗の確認まで、すべてがリアルタイムで行われます。
- **生産性の飛躍:** 面倒な作業はJulesに任せ、あなたは創造的な仕事に集中できます。

## 🚀 主な機能

| 機能                   | 説明                                                                                                                                                                                             | コマンド / アイコン                      |
| :--------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| **APIキーの設定**      | 初回利用時にAPIキーを設定し、Julesアカウントに接続します。キーはVSCodeのSecretStorageに安全に保存され、以降のリクエストで自動的に使用されます。                                                       | `Set Jules API Key`                      |
| **APIキーの検証**      | API接続をテストし、キーが有効で正常に機能していることを確認します。                                                                                                                               | `Verify Jules API Key`                   |
| **ソースのリスト表示** | Julesが作業可能なデータソースを閲覧します。                                                                                                                                                      | `List Jules Sources`                     |
| **セッション管理**     | `> Create Jules Session`コマンドで、新しいコーディングタスクをJulesに割り当てます。過去のセッションも一覧表示され、いつでも作業を再開したり、完了したタスクの履歴を確認したりできます。                | `Create Jules Session`                   |
| **リアルタイム監視**   | Julesの現在の作業状況（`Running`, `Active`, `Done`など）を、専用のサイドバービューで一目で確認できます。もうブラウザとエディタを行き来する必要はありません。                                         | `julesSessionsView` (View)               |
| **進捗の更新**         | Julesがどこまで進んだか気になったら、`↻`（更新）ボタンをクリックするだけで、最新のセッション状況とアクティビティリストを即座に取得・表示します。                                                     | `Refresh Jules Sessions`                 |
| **アクティビティ表示** | セッションを選択すると、Julesが実行したコマンド、編集したファイル、その思考プロセスなどの詳細なログを確認できます。まるでJulesの心の中を覗いているかのような、透明性の高い開発体験を提供します。     | `Show Jules Activities`                  |
| **アクティビティの更新** | 現在のセッションのアクティビティビューを更新し、最新の進捗を確認します。                                                                                                                       | `Refresh Jules Activities`               |
| **メッセージの送信**   | アクティブなJulesセッションにフォローアップメッセージを送信し、追加の指示やフィードバックを与えます。                                                                                             | `Send Message to Jules Session`          |
| **計画の承認**         | Julesが生成した計画を実行前にレビューし、承認します。                                                                                                                                              | `Jules: Approve Jules Plan`              |
| **設定を開く**         | Jules拡張機能の設定を開きます。                                                                                                                                                                  | `Jules: Open Jules Settings`             |
| **セッションの削除**   | ローカルキャッシュからセッションを削除します。                                                                                                                                                   | `Jules: Delete Session from Local Cache` |
| **GitHubトークンの設定** | PRのステータスを確認するためのGitHubパーソナルアクセストークンを設定します。                                                                                                                   | `Jules: Set GitHub Token (for PR Status)`|
| **キャッシュのクリア** | Jules拡張機能のキャッシュをクリアします。                                                                                                                                                      | `Jules: Clear Jules Cache`               |
| **GitHubへのサインイン** | GitHubアカウントにサインインします。                                                                                                                                                           | `Jules: Sign in to GitHub`               |

## 📦 インストール

[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)からインストールしてください。

または、VS Codeの拡張機能ビューで「Jules Extension」を検索してください。

### Marketplaceから (推奨)

1. VSCode Marketplaceで「Jules Extension」を検索します。
2. `Install`ボタンをクリックします。

### VSIXファイルから (手動インストール)

まだMarketplaceに公開されていない最新の機能を試したい場合は、リリースページから`.vsix`ファイルを直接ダウンロードしてインストールできます。

1. **リリースページに移動:**
   [GitHub Releases](https://github.com/is0692vs/jules-extension/releases)にアクセスし、最新のリリースバージョンを見つけます。

2. **VSIXファイルをダウンロード:**
   `Assets`から`.vsix`ファイル（例: `jules-extension-0.1.0.vsix`）をダウンロードします。

3. **VSCodeにインストール:**
   - VSCodeを開きます。
   - `Extensions`ビューに移動します（`Ctrl+Shift+X`）。
   - ビューの上部にある`...`（その他のアクション）メニューをクリックし、`Install from VSIX...`を選択します。
   - ダウンロードした`.vsix`ファイルを選択してインストールします。

### 特定のバージョンをインストールする

特定のバージョンの拡張機能をインストールするには：

1. [GitHub Releasesページ](https://github.com/is0692vs/jules-extension/releases)に移動します。
2. インストールしたいバージョンを見つけ、その`Assets`から`.vsix`ファイルをダウンロードします。
3. 上記の「VSCodeにインストール」の手順に従います。

## 🔑 APIキーの取得方法

Jules Extensionを使用するには、Jules APIキーが必要です。以下の手順で取得してください。

1. **アカウントの作成:**
   - [Jules公式サイト](https://jules.google/docs)にアクセスします。
   - 新規アカウントを登録するか、既にお持ちの場合はログインします。

2. **APIキーの生成:**
   - アカウントダッシュボードの「APIキー」または「開発者設定」セクションに移動します。
   - 「新しいシークレットキーを作成」をクリックします。
   - キーに分かりやすい名前（例：「VSCode Extension」）を付けて生成します。

3. **キーをコピー:**
   - 新しいAPIキーが表示されます。クリップボードにコピーしてください。
   - 後で再度キーを確認する必要がある場合は、いつでもJulesの設定ページで見つけることができます。

> **重要:** APIキーはパスワードのように扱ってください。公に共有したり、バージョン管理にコミットしたりしないでください。

## 認証

### OAuthサインイン (推奨) ✅

`Jules: Sign in to GitHub`コマンドを使用してください。

**使い方:**

1. コマンドパレット（`Cmd+Shift+P`）を開きます。
2. `Jules: Sign in to GitHub`を実行します。
3. ブラウザで認証します。

---

### GitHub PAT (非推奨) ⚠️

**PATのサポートは非推奨となり、将来のバージョンで削除される予定です。**

OAuthサインインへの移行をお願いします。

## ⚙️ 拡張機能の設定

この拡張機能は、以下の設定項目を提供します。

- `jules-extension.apiKey`: 認証用のJules APIキー（安全に保存されます）。
- `jules-extension.autoRefresh.enabled`: セッションリストの自動更新を有効にします（デフォルト: `false`）。
- `jules-extension.autoRefresh.interval`: 自動更新の間隔（秒）（デフォルト: `60`, 最小: 10）。
- `jules-extension.autoRefresh.fastInterval`: 特定の操作中（ブランチの読み込みなど）の自動更新間隔（秒）。最小: 5。（デフォルト: `30`）。
- `jules-extension.customPrompt`: Julesに送信するすべてのメッセージの先頭に自動的に付加されるカスタムプロンプト。
- `jules-extension.hideClosedPRSessions`: クローズまたはマージされたプルリクエストを持つセッションをセッションリストから自動的に非表示にします（デフォルト: `true`）。
- `jules.defaultBranch`: Julesセッション作成時のデフォルトブランチ選択の挙動（`current`, `default`, `main`）。

### 非推奨の設定 ⚠️

- `jules-extension.githubToken`: この設定は非推奨です。代わりに`Jules: Set GitHub Token`コマンドを使用してください。
- `jules.githubPat`: この設定は非推奨です。代わりに`Jules: Sign in to GitHub`コマンドを使用してください。

## クイックスタート

1. `Ctrl + Shift + P`（または`Cmd + Shift + P`）を押して、コマンドパレットを開きます。
2. `> Set Jules API Key`を実行し、APIキーを入力します。
3. サイドバーの`$(robot)`アイコンをクリックして、Julesセッションビューを開きます。
4. `> Create Jules Session`を実行して、最初のコーディングセッションを開始しましょう！

## ⚠️ 注意事項

- **カードブロックのレンダリング:** カードブロックとして表示される機能を使用する際は、コンテンツの構造が正しくレンダリングされるように注意してください。

## 📚 リンク

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHubリポジトリ](https://github.com/is0692vs/jules-extension)
- [課題報告](https://github.com/is0692vs/jules-extension/issues)

## 🤝 コントリビューション

このプロジェクトはまだ始まったばかりです。バグ報告、機能提案、プルリクエストなど、あらゆる形のコントリビューションを歓迎します！
Issue TrackerやPull Requestsをご確認ください。

## 📝 ライセンス

[MIT](LICENSE)
