# Jules Extension for VSCode

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)]
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "VSCodeでGoogle Julesと共に、未来のコーディングを体験しよう"

Jules Extensionは、GoogleのAIコーディングエージェント**Jules**をVSCodeから直接操作できるようにする拡張機能です。
あなたのコーディングワークフローに、知的なパートナーを迎え入れましょう。

## ✨ コンセプト

この拡張機能は、あなたの開発体験を次のレベルへと引き上げるために作られました。

- **シームレスな統合:** 使い慣れたVSCode環境を離れることなく、Julesの強力な機能にアクセスできます。
- **リアルタイム連携:** コーディングセッションの作成から進捗の確認まで、すべてがリアルタイムで行われます。
- **生産性の飛躍:** 面倒な作業はJulesに任せ、あなたは創造的な仕事に集中できます。

## 🚀 主な機能

| 機能                 | 説明                                                                                                                                                                                                                     | コマンド / アイコン                 |
| :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------- |
| **APIキーの設定**      | 初回利用時に、Julesアカウントに接続するためのAPIキーを設定します。キーはVSCodeのSecretStorageに安全に保存され、以降のすべてのリクエストで自動的に使用されます。                                                         | `jules-extension.setApiKey`         |
| **APIキーの検証**      | API接続をテストし、キーが有効で正常に機能していることを確認します。                                                                                                                                                     | `jules-extension.verifyApiKey`      |
| **ソース一覧の表示**   | Julesが作業できるデータソースを参照します。                                                                                                                                                                                | `jules-extension.listSources`       |
| **セッション管理**     | `> Jules: Create Session`コマンドで、新しいコーディングタスクをJulesに割り当てます。過去のセッションも一覧表示され、いつでも作業を再開したり、完了したタスクの履歴を確認したりできます。                                 | `jules-extension.createSession`     |
| **リアルタイム監視**   | Julesの現在の作業状況（`Running`、`Active`、`Done`など）を、専用のサイドバービューでひと目で確認できます。ブラウザとエディタを行き来する必要はもうありません。                                                              | `julesSessionsView`                 |
| **進捗の更新**         | Julesがどこまで進んだか気になりますか？ `↻`（更新）ボタンをクリックすると、最新のセッションステータスとアクティビティリストを即座に取得して表示します。                                                                 | `jules-extension.refreshSessions`   |
| **アクティビティ表示** | セッションを選択すると、Julesが実行したコマンド、編集したファイル、その思考プロセスなどの詳細なログが表示されます。まるでJulesの心の中を覗いているかのような、透明性の高い開発体験を提供します。                         | `jules-extension.showActivities`    |
| **アクティビティ更新** | 現在のセッションのアクティビティビューを更新して、最新の進捗を確認します。                                                                                                                                                 | `jules-extension.refreshActivities` |
| **メッセージ送信**     | アクティブなJulesセッションにフォローアップメッセージを送信して、追加の指示やフィードバックを提供します。                                                                                                               | `jules-extension.sendMessage`       |
| **計画の承認**         | 実行前にJulesが生成した計画を確認し、承認します。                                                                                                                                                                       | `jules-extension.approvePlan`       |
| **設定を開く**         | 拡張機能に関するすべての設定を一覧表示し、カスタマイズするためのUIを開きます。                                                                                                                                          | `jules-extension.openSettings`      |
| **セッションの削除**   | ローカルキャッシュから特定のセッションを削除し、ビューを整理します。                                                                                                                                                      | `jules-extension.deleteSession`     |
| **GitHub認証**     | `Sign in to GitHub`コマンドを使用してOAuth認証を行い、プライベートリポジトリのPRステータスなどを安全に取得します。PAT（Personal Access Token）は非推奨となりました。                                                        | `jules-extension.signInGitHub`      |
| **キャッシュクリア**   | 拡張機能が内部で保持しているキャッシュ（セッション情報など）をすべて削除します。問題が発生した場合のトラブルシューティングに役立ちます。                                                                               | `jules-extension.clearCache`        |

## 📦 インストール

[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)からインストールしてください。

または、VS Codeの拡張機能ビューで "Jules Extension" を検索してください。

### Marketplaceから（推奨）

1. VSCode Marketplaceで "Jules Extension" を検索します。
2. `インストール`ボタンをクリックします。

### VSIXファイルから（手動インストール）

Marketplaceでまだ公開されていない最新の機能を試したい場合は、リリースパージから`.vsix`ファイルを直接ダウンロードしてインストールできます。

1. **リリースページへ移動:**
   [GitHub Releases](https://github.com/is0692vs/jules-extension/releases)にアクセスし、最新のリリースバージョンを見つけます。

2. **VSIXファイルをダウンロード:**
   `Assets`から`.vsix`ファイル（例：`jules-extension-0.1.0.vsix`）をダウンロードします。

3. **VSCodeにインストール:**
   - VSCodeを開きます。
   - `拡張機能`ビュー（`Ctrl+Shift+X`）に移動します。
   - ビューの上部にある`...`（その他のアクション）メニューをクリックし、`VSIXからのインストール...`を選択します。
   - ダウンロードした`.vsix`ファイルを選択してインストールします。

## 🔑 APIキーの取得方法

Jules Extensionを使用するには、JulesのAPIキーが必要です。以下の手順で取得してください。

1. **アカウントの作成:**

   - [Jules公式サイト](https://jules.google/docs)にアクセスします。
   - 新しいアカウントにサインアップするか、すでにアカウントをお持ちの場合はログインします。

2. **APIキーの生成:**

   - アカウントダッシュボードの「APIキー」または「開発者設定」セクションに移動します。
   - 「新しいシークレットキーを作成」をクリックします。
   - キーにわかりやすい名前（例：「VSCode拡張機能」）を付けて生成します。

3. **キーのコピー:**
   - 新しいAPIキーが表示されます。クリップボードにコピーしてください。
   - 後でキーを再度表示する必要がある場合は、いつでもJulesの設定ページで確認できます。

> **重要:** APIキーはパスワードのように扱ってください。公に共有したり、バージョン管理にコミットしたりしないでください。

## 認証

### GitHub OAuthによるサインイン（推奨） ✅

本拡張機能では、GitHubアカウントとの連携に**OAuth認証**を推奨しています。
`Jules: Sign in to GitHub`コマンドを実行すると、ブラウザが開き、安全な認証プロセスを経てVSCodeがGitHub APIにアクセスできるようになります。

**主なメリット:**
- **セキュリティ:** Personal Access Token（PAT）を直接設定ファイルに保存する必要がなく、より安全です。
- **利便性:** 一度の認証で、APIアクセスのためのトークンが自動的に管理されます。
- **適切な権限管理:** 拡張機能が必要とする最小限の権限（スコープ）のみを要求します。

**認証手順:**
1. コマンドパレット（`Cmd+Shift+P` または `Ctrl+Shift+P`）を開きます。
2. `Jules: Sign in to GitHub` を検索し、実行します。
3. 自動的に開かれるブラウザの指示に従い、GitHubアカウントでの認証を許可します。

---

### Personal Access Token (PAT) の利用（非推奨） ⚠️

従来のPersonal Access Token (PAT) を用いた認証は**非推奨**となっており、将来のバージョンでサポートが終了する予定です。
現在PATをご利用の方は、セキュリティと利便性の向上のため、速やかにOAuth認証へ移行してください。

## ⚙️ 拡張機能の設定

この拡張機能では、動作をカスタマイズするために以下の設定が用意されています。
`設定` > `拡張機能` > `Jules Extension` から変更できます。

| 設定ID                               | 説明                                                                                                                              | デフォルト値 |
| :----------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :----------- |
| `jules-extension.apiKey`             | Jules APIに接続するためのAPIキーです。                                                                                             | `""`         |
| `jules-extension.autoRefresh.enabled`  | セッションリストを一定間隔で自動的に更新するかどうかを設定します。                                                                  | `false`      |
| `jules-extension.autoRefresh.interval` | 自動更新を行う間隔を秒単位で指定します。（最小：10秒）                                                                             | `30`         |
| `jules-extension.customPrompt`       | Julesへのすべてのメッセージの先頭に自動的に付加されるカスタムプロンプトです。永続的な指示を与えたい場合に便利です。                     | `""`         |
| `jules-extension.hideClosedPRSessions` | クローズまたはマージされたプルリクエストに関連するセッションを、セッションリストから自動的に非表示にします。                         | `true`       |
| `jules.defaultBranch`                | 新しいJulesセッションを作成する際の、デフォルトのブランチ選択挙動を定義します。(`current`, `default`, `main`から選択)                 | `current`    |
| `jules.githubPat`                      | **[非推奨]** GitHubのPAT（Personal Access Token）です。OAuthサインインの使用を強く推奨します。                                        | `""`         |

## クイックスタート

1. `Ctrl + Shift + P`（または`Cmd + Shift + P`）を押してコマンドパレットを開きます。
2. `> Jules: Set Jules API Key`を実行し、APIキーを入力します。
3. サイドバーの`$(robot)`アイコンをクリックして、Julesセッションビューを開きます。
4. `> Jules: Create Jules Session`を実行して、最初のコーディングセッションを開始します！

## ⚠️ 注意事項

- **カードブロックのレンダリング:** カードブロックとして表示される機能を使用する際は、コンテンツの構造が正しくレンダリングされるように注意してください。

## コマンド

コマンドパレットから以下のコマンドを実行できます。

- `Jules: Set Jules API Key` - APIクレデンシャルを設定します
- `Jules: Verify Jules API Key` - API接続をテストします
- `Jules: List Jules Sources` - 利用可能なソースを閲覧します
- `Jules: Create Jules Session` - 新しい分析セッションを開始します
- `Jules: Refresh Jules Sessions` - セッションリストを再読み込みします
- `Jules: Show Jules Activities` - セッションのアクティビティを表示します
- `Jules: Refresh Jules Activities` - アクティビティビューを更新します
- `Jules: Send Message to Jules Session` - アクティブなセッションにフォローアップの指示を投稿します
- `Jules: Approve Jules Plan` - 生成された計画を実行のために承認します
- `Jules: Open Jules Settings` - 拡張機能の設定画面を開きます
- `Jules: Delete Session from Local Cache` - 選択したセッションをローカルキャッシュから削除します
- `Jules: Sign in to GitHub` - GitHubアカウントと連携するためのOAuth認証を開始します
- `Jules: Clear Jules Cache` - 拡張機能の全キャッシュをクリアします
- `Jules: [DEPRECATED] Set GitHub PAT` - 非推奨のPAT設定コマンドです

## 📚 リンク

- [Marketplace](https
://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHubリポジトリ](https://github.com/is0692vs/jules-extension.git)
- [問題報告](https://github.com/is0692vs/jules-extension/issues)

## 🤝 コントリビューション

このプロジェクトはまだ始まったばかりです。バグ報告、機能提案、プルリクエストなど、あらゆる形のコントリビューションを歓迎します！
Issue TrackerとPull Requestsをご確認ください。

## 📝 ライセンス

[MIT](LICENSE)
