# Jules Extension for VSCode

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)]
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "VSCodeでGoogle Julesと共に、未来のコーディングを体験しよう"

Jules Extensionは、GoogleのAIコーディングエージェント**Jules**をVSCode内から直接操作できるようにする拡張機能です。
あなたのコーディングワークフローに、知的なパートナーを迎え入れましょう。

## ✨ コンセプト

この拡張機能は、あなたの開発体験を次のレベルへと引き上げるために作られました。

- **シームレスな統合:** 使い慣れたVSCode環境を離れることなく、Julesの強力な機能にアクセスできます。
- **リアルタイムな連携:** コーディングセッションの作成から進捗の確認まで、すべてがリアルタイムで行われます。
- **生産性の飛躍:** 面倒な作業はJulesに任せ、あなたは創造的な仕事に集中できます。

## 🚀 クイックスタート

1. `Ctrl + Shift + P`（または`Cmd + Shift + P`）を押して、コマンドパレットを開きます。
2. `> Jules: Set Jules API Key`を実行し、APIキーを入力します。
3. サイドバーの`$(robot)`アイコンをクリックして、Julesセッションビューを開きます。
4. `> Jules: Create Jules Session`を実行して、最初のコーディングセッションを開始しましょう！

## 📦 主な機能

| 機能 | 説明 | コマンド / アイコン |
| :--- | :--- | :--- |
| **GitHubサインイン** | OAuth経由でGitHubにサインインし、安全に認証します。 | `jules-extension.signInGitHub` |
| **APIキーの設定** | Julesアカウントに接続するためのAPIキーを設定します。キーは安全に保管されます。 | `jules-extension.setApiKey` |
| **セッション管理** | `> Jules: Create Session`コマンドで新しいコーディングタスクを割り当てます。過去のセッションも一覧表示されます。 | `jules-extension.createSession` |
| **リアルタイム監視** | 専用のサイドバービューで、Julesの現在の作業状況（`Running`、`Active`など）を一目で確認できます。 | `julesSessionsView` |
| **進捗の更新** | `↻`（更新）ボタンで、最新のセッション状況とアクティビティリストを即座に取得・表示します。 | `jules-extension.refreshSessions` |
| **アクティビティ表示** | セッションを選択すると、Julesが実行したコマンドや思考プロセスなどの詳細なログを確認できます。 | `jules-extension.showActivities` |
| **計画の承認** | Julesが生成した実行計画をレビューし、承認または拒否できます。 | `jules-extension.approvePlan` |
| **設定画面** | 拡張機能に関するすべての設定をGUIで簡単に変更できます。 | `jules-extension.openSettings` |
| **キャッシュのクリア** | ローカルのセッションキャッシュを削除して、問題を解決します。 | `jules-extension.clearCache` |

## ⚙️ インストール

[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)からインストールしてください。

または、VS Codeの拡張機能ビューで "Jules Extension" を検索してください。

### Marketplaceから（推奨）

1. VSCode Marketplaceで "Jules Extension" を検索します。
2. `Install`ボタンをクリックします。

### VSIXファイルから（手動インストール）

まだMarketplaceに公開されていない最新の機能を試したい場合は、リリースページから`.vsix`ファイルを直接ダウンロードしてインストールできます。

1. **リリースページに移動:**
   [GitHub Releases](https://github.com/is0692vs/jules-extension/releases)にアクセスし、最新のリリースバージョンを見つけます。

2. **VSIXファイルをダウンロード:**
   `Assets`から`.vsix`ファイル（例: `jules-extension-0.1.0.vsix`）をダウンロードします。

3. **VSCodeにインストール:**
   - VSCodeを開きます。
   - `拡張機能`ビューに移動します（`Ctrl+Shift+X`）。
   - ビューの上部にある`...`（その他のアクション）メニューをクリックし、`Install from VSIX...`を選択します。
   - ダウンロードした`.vsix`ファイルを選択してインストールします。

## 🔑 APIキーの取得と認証

Jules Extensionを使用するには、JulesのAPIキーが必要です。以下の手順で取得してください。

### 1. APIキーの取得

1. **アカウントの作成:**

   - [Jules公式サイト](https://jules.google/docs)にアクセスします。
   - 新規アカウントを登録するか、既にお持ちの場合はログインします。

2. **APIキーの生成:**

   - アカウントのダッシュボードで、「APIキー」または「開発者設定」セクションに移動します。
   - 「新しいシークレットキーを作成」をクリックします。
   - キーに分かりやすい名前（例: "VSCode Extension"）を付け、生成します。

3. **キーのコピー:**
   - 新しいAPIキーが表示されます。クリップボードにコピーしてください。
   - 後で再度キーを確認する必要がある場合でも、いつでもJulesの設定ページで確認できます。

> **重要:** APIキーはパスワードのように扱ってください。公に共有したり、バージョン管理にコミットしたりしないでください。

### 2. 認証

本拡張機能は、GitHub APIと連携してプルリクエストのステータスなどを確認します。認証には、OAuthアプリ経由でのサインインを推奨しています。

#### GitHub サインイン (推奨)

コマンドパレットから `Jules: Sign in to GitHub` を実行し、ブラウザで認証を完了してください。

#### GitHub 個人アクセストークン (PAT) (非推奨)

個人アクセストークン (PAT) のサポートは **非推奨** となっており、将来のバージョンで削除される予定です。セキュリティと利便性の観点から、OAuthサインインへの移行を強くお勧めします。

## 🔧 拡張機能の設定

この拡張機能は、以下の設定項目を提供します。

- `jules-extension.apiKey`: 認証用のJules APIキー（安全に保管されます）。
- `jules-extension.autoRefresh.enabled`: セッションリストの自動更新を有効にします（デフォルト: `false`）。
- `jules-extension.autoRefresh.interval`: 自動更新の間隔を秒単位で設定します（デフォルト: `30`、最小: `10`）。
- `jules-extension.customPrompt`: Julesへのすべてのメッセージの先頭に自動的に付加されるカスタムプロンプト。永続的な指示として機能します。
- `jules-extension.hideClosedPRSessions`: クローズまたはマージされたプルリクエストを持つセッションを自動的に非表示にします（デフォルト: `true`）。
- `jules.defaultBranch`: セッション作成時のデフォルトブランチ選択の挙動を設定します（`current`, `default`, `main`から選択）。
- `jules.githubPat`: **[非推奨]** GitHub Personal Access Token。代わりにOAuthサインインを使用してください。

## 📖 コマンド

コマンドパレット (`Ctrl+Shift+P` または `Cmd+Shift+P`) から以下のコマンドを実行できます。

- **Jules: Sign in to GitHub**: OAuthを使用してGitHubにサインインします。
- **Jules: Set Jules API Key**: Jules APIキーを設定します。
- **Jules: Verify Jules API Key**: APIキーの有効性を確認します。
- **Jules: Create Jules Session**: 新しいコーディングセッションを開始します。
- **Jules: Refresh Jules Sessions**: セッションリストを更新します。
- **Jules: List Jules Sources**: 利用可能なソースを一覧表示します。
- **Jules: Show Jules Activities**: 選択したセッションのアクティビティを表示します。
- **Jules: Refresh Jules Activities**: アクティビティビューを更新します。
- **Jules: Send Message to Jules Session**: アクティブなセッションにメッセージを送信します。
- **Jules: Approve Jules Plan**: Julesの計画を承認します。
- **Jules: Open Jules Settings**: 拡張機能の設定画面を開きます。
- **Jules: Delete Session from Local Cache**: ローカルキャッシュからセッションを削除します。
- **Jules: Clear Jules Cache**: すべてのローカルキャッシュをクリアします。

## ⚠️ 注意事項

- **カードブロックのレンダリング:** カードブロックとして表示される機能を使用する際は、コンテンツの構造が正しくレンダリングされるように注意してください。

## 📚 リンク

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHubリポジトリ](https://github.com/is0692vs/jules-extension.git)
- [問題を報告](https://github.com/is0692vs/jules-extension/issues)

## 🤝 コントリビューション

このプロジェクトはまだ始まったばかりです。バグ報告、機能提案、プルリクエストなど、あらゆる形のコントリビューションを歓迎します！
Issue TrackerやPull Requestsをご確認ください。

## 📝 ライセンス

[MIT](LICENSE)
