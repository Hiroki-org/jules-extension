# Jules VSCode拡張機能

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)]
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "GoogleのAIコーディングエージェント「Jules」と共に、未来のコーディングを体験しよう"

Jules拡張機能は、GoogleのAIコーディングエージェント**Jules**をVSCodeから直接操作するための拡張機能です。
インテリジェントなパートナーを、あなたのコーディングワークフローに迎え入れましょう。

## ✨ コンセプト

この拡張機能は、あなたの開発体験を次のレベルへ引き上げるために作成されました。

- **シームレスな統合:** 使い慣れたVSCode環境を離れることなく、Julesの強力な機能にアクセスできます。
- **リアルタイムな連携:** コーディングセッションの作成から進捗の確認まで、すべてがリアルタイムで行われます。
- **生産性の飛躍:** 面倒な作業はJulesに任せ、あなたは創造的な仕事に集中できます。

## 🚀 主な機能

| 機能                               | 説明                                                                                                                     | コマンド                                  |
| :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------- | :---------------------------------------- |
| **APIキーの設定**                  | 初回利用時にAPIキーを設定し、Julesアカウントに接続します。キーはVSCodeのSecretStorageに安全に保存され、以降のリクエストで自動的に使用されます。 | `Set Jules API Key`                       |
| **APIキーの検証**                  | API接続をテストし、キーが有効であることを確認します。                                                                      | `Verify Jules API Key`                    |
| **ソースの表示**                   | Julesが作業可能なデータソースを一覧表示します。                                                                          | `List Jules Sources`                      |
| **セッションの作成**               | 新しいコーディングタスクをJulesに割り当てます。                                                                          | `Create Jules Session`                    |
| **セッションの更新**               | `↻` (更新) ボタンで、セッションリストを最新の状態に更新します。                                                          | `Refresh Jules Sessions`                  |
| **アクティビティ表示**             | 選択したセッションの、Julesが実行したコマンドや思考プロセスなどの詳細なログを表示します。                                  | `Show Jules Activities`                   |
| **アクティビティの更新**           | 現在のセッションのアクティビティビューを更新し、最新の進捗を確認します。                                                  | `Refresh Jules Activities`                |
| **メッセージの送信**               | アクティブなJulesセッションに追加の指示やフィードバックを送信します。                                                      | `Send Message to Jules Session`           |
| **計画の承認**                     | Julesが生成した計画を実行前にレビューし、承認します。                                                                    | `Jules: Approve Jules Plan`               |
| **GitHubへのサインイン**           | **(推奨)** OAuth認証フローを開始し、安全にGitHubアカウントにサインインします。                                           | `Jules: Sign in to GitHub`                |
| **設定を開く**                     | Jules拡張機能の設定を開きます。                                                                                          | `Jules: Open Jules Settings`              |
| **セッションの削除**               | ローカルキャッシュからセッションを削除します。                                                                          | `Jules: Delete Session from Local Cache`  |
| **キャッシュのクリア**             | ローカルに保存されているソースやブランチのキャッシュを削除します。                                                          | `Jules: Clear Jules Cache`                |
| **GitHubトークンの設定 (非推奨)**  | PRのステータスを確認するためのGitHub PATを設定します。OAuthサインインへの移行を推奨します。                                    | `Jules: Set GitHub Token (for PR Status)` |
| **GitHub PATの設定 (非推奨)**      | 廃止予定のコマンドです。                                                                                                | `Jules: [DEPRECATED] Set GitHub PAT`      |

## 📦 インストール

[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)からインストールしてください。

または、VSCodeの拡張機能ビューで "Jules Extension" を検索してください。

### Marketplaceから (推奨)

1. VSCodeのMarketplaceで "Jules Extension" を検索します。
2. `インストール` ボタンをクリックします。

### VSIXファイルから (手動インストール)

まだMarketplaceに公開されていない最新の機能を試したい場合は、リリースぺージから`.vsix`ファイルを直接ダウンロードしてインストールできます。

1. **リリースぺージへ移動:**
   [GitHub Releases](https://github.com/is0692vs/jules-extension/releases) にアクセスし、最新のリリースバージョンを見つけます。

2. **VSIXファイルをダウンロード:**
   `Assets` から `.vsix` ファイル (例: `jules-extension-0.1.0.vsix`) をダウンロードします。

3. **VSCodeにインストール:**
   - VSCodeを開きます。
   - `拡張機能` ビュー (`Ctrl+Shift+X`) に移動します。
   - ビューの上部にある `...` (その他のアクション) メニューをクリックし、`VSIXからのインストール...` を選択します。
   - ダウンロードした `.vsix` ファイルを選択してインストールします。

### 特定のバージョンをインストールする

特定のバージョンをインストールするには:

1. [GitHub Releases ページ](https://github.com/is0692vs/jules-extension/releases) にアクセスします。
2. インストールしたいバージョンを見つけ、その`Assets`から`.vsix`ファイルをダウンロードします。
3. 上記の「VSCodeにインストール」の手順に従います。

## 🔑 APIキーの取得方法

Jules拡張機能を使用するには、JulesのAPIキーが必要です。以下の手順で取得してください:

1. **アカウントの作成:**

   - [Jules公式サイト](https://jules.google/docs) にアクセスします。
   - 新しいアカウントを登録するか、既にお持ちの場合はログインします。

2. **APIキーの生成:**

   - アカウントダッシュボードの「APIキー」または「開発者設定」セクションに移動します。
   - 「新しいシークレットキーを作成」をクリックします。
   - キーに分かりやすい名前（例: "VSCode Extension"）を付けて生成します。

3. **キーのコピー:**
   - 新しいAPIキーが表示されます。クリップボードにコピーしてください。
   - 後で再度キーを確認する必要がある場合は、いつでもJulesの設定ページで見つけることができます。

> **重要:** APIキーはパスワードのように扱ってください。公に共有したり、バージョン管理にコミットしたりしないでください。

## GitHubとの連携 (PRステータス確認)

Julesが作成したPull RequestのステータスをVSCode内で確認するために、GitHubアカウントとの連携が必要です。

### 認証方法

#### 1. OAuth Appによるサインイン (推奨) ✅

VSCodeのOAuth認証フローを利用した、最も安全で簡単な方法です。

**手順:**
1. コマンドパレット (`Cmd+Shift+P`) を開きます。
2. `Jules: Sign in to GitHub` を実行します。
3. 指示に従い、ブラウザでGitHubの認証を完了します。

---

#### 2. 個人アクセストークン (PAT) の利用 (非推奨) ⚠️

この方法は、OAuth App認証が利用できない環境向けの代替手段です。**PATのサポートは将来のバージョンで廃止される可能性があります。**

**手順:**
1. [GitHubの開発者設定ページ](https://github.com/settings/tokens)で、`repo`スコープを持つPATを作成します。
2. コマンドパレットで`Jules: Set GitHub Token (for PR Status)` を実行し、コピーしたトークンを貼り付けます。

## ⚙️ 拡張機能の設定

この拡張機能は、以下の設定項目を提供します:

- **`jules-extension.apiKey`**:
  - **説明:** Jules APIに接続するためのAPIキー。VSCodeのSecretStorageに安全に保存されます。
  - **デフォルト:** `""`

- **`jules-extension.autoRefresh.enabled`**:
  - **説明:** セッションリストの自動更新を有効にします。ユーザーのフィードバックや計画承認の通知に必要です。
  - **デフォルト:** `true`

- **`jules-extension.autoRefresh.interval`**:
  - **説明:** 自動更新の間隔を秒単位で指定します。
  - **デフォルト:** `60` (最小: `10`)

- **`jules-extension.autoRefresh.fastInterval`**:
  - **説明:** ブランチ読み込みなど、特定の操作中の自動更新間隔を秒単位で指定します。
  - **デフォルト:** `30` (最小: `5`)

- **`jules-extension.customPrompt`**:
  - **説明:** Julesに送信する全てのメッセージの先頭に自動で追加されるカスタムプロンプト。永続的な指示を与えたい場合に便利です。(例: `常に日本語で応答してください。`)
  - **デフォルト:** `""`

- **`jules-extension.hideClosedPRSessions`**:
  - **説明:** クローズまたはマージされたPull Requestに関連するセッションを一覧から自動的に非表示にします。
  - **デフォルト:** `true`

- **`jules.defaultBranch`**:
  - **説明:** セッション作成時のデフォルトブランチを選択します。
  - **設定値:**
    - `current`: 現在のGitブランチを使用します。
    - `default`: リポジトリのデフォルトブランチを使用します。
    - `main`: `main`ブランチを使用します（存在しない場合はリポジトリのデフォルト）。
  - **デフォルト:** `current`

---

### 非推奨の設定 ⚠️

- **`jules-extension.githubToken`**:
  - **理由:** 安全なSecretStorageに保存するため、コマンド経由での設定に移行しました。
  - **代替:** `Jules: Set GitHub Token (for PR Status)` コマンドを使用してください。

- **`jules.githubPat`**:
  - **理由:** より安全なOAuth認証に移行したため。
  - **代替:** `Jules: Sign in to GitHub` コマンドを使用してください。

## クイックスタート

1. `Ctrl + Shift + P` (または `Cmd + Shift + P`) を押して、コマンドパレットを開きます。
2. `> Jules: Set Jules API Key` を実行し、APIキーを入力します。
3. サイドバーの `$(robot)` アイコンをクリックして、Julesセッションビューを開きます。
4. `> Jules: Create Jules Session` を実行して、最初のコーディングセッションを開始しましょう！

## ⚠️ 重要事項

- **カードブロックのレンダリング:** カードブロックとして表示される機能を使用する場合、コンテンツの構造が正しくレンダリングされるように注意してください。

## 📚 リンク

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHubリポジトリ](https://github.com/is0692vs/jules-extension)
- [問題報告](https://github.com/is0692vs/jules-extension/issues)

## 🤝 コントリビューション

このプロジェクトはまだ始まったばかりです。バグ報告、機能提案、プルリクエストなど、あらゆる形の貢献を歓迎します！
Issue TrackerやPull Requestsをご確認ください。

## 📝 ライセンス

[MIT](LICENSE)
