# Jules Extension for VSCode

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)]
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "Experience the future of coding with Google Jules in VSCode"

Jules Extension is an extension that allows you to operate Google's AI coding agent **Jules** directly from within VSCode.
Welcome an intelligent partner to your coding workflow.

## ✨ Concept

This extension was created to take your development experience to the next level.

- **Seamless Integration:** Access the powerful features of Jules without leaving your usual VSCode environment.
- **Real-time Collaboration:** From creating a coding session to checking its progress, everything is in real-time.
- **Productivity Leap:** Leave the tedious tasks to Jules and focus on your creative work.

## 🚀 Key Features

| Feature                  | Description                                                                                                                                                                                                        | Command / Icon                      |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------- |
| **GitHubサインイン**     | GitHubアカウントでOAuth認証を行い、安全でシームレスな接続を実現します。これはアカウントを連携するための推奨される方法です。                                                                       | `jules-extension.signInGitHub`      |
| **APIキーの設定**        | 初回利用時にAPIキーを設定し、Julesアカウントに接続します。キーはVSCodeのSecretStorageに安全に保管され、以降のすべてのリクエストで自動的に使用されます。                                          | `jules-extension.setApiKey`         |
| **APIキーの検証**        | API接続をテストし、キーが有効で正常に動作することを確認します。                                                                                                                                                   | `jules-extension.verifyApiKey`      |
| **ソースの表示**         | Julesが利用可能なデータソースを一覧表示します。                                                                                                                                                            | `jules-extension.listSources`       |
| **セッション管理**       | `jules-extension.createSession` コマンドでJulesに新しいコーディングタスクを割り当てます。過去のセッションも一覧表示され、いつでも作業を再開したり、完了したタスクの履歴を確認したりできます。                   | `jules-extension.createSession`     |
| **リアルタイム監視**     | Julesの現在の作業状況（`Running`、`Active`、`Done`など）を専用のサイドバービューで一目で確認できます。ブラウザとエディタを行き来する必要はもうありません。                          | `julesSessionsView`                 |
| **進捗の更新**           | Julesがどれだけ進んだか気になりますか？ `↻`（更新）ボタンをクリックすると、最新のセッションステータスとアクティビティリストを即座に取得して表示します。                                                             | `jules-extension.refreshSessions`   |
| **アクティビティ表示**   | セッションを選択すると、Julesが実行したコマンド、編集したファイル、その思考プロセスの詳細なログが表示されます。まるでJulesの心の中を覗いているかのような、透明性の高い開発体験を提供します。 | `jules-extension.showActivities`    |
| **アクティビティの更新** | 現在のセッションのアクティビティビューを更新して、最新の進捗を確認します。                                                                                                                                     | `jules-extension.refreshActivities` |
| **メッセージの送信**     | アクティブなJulesセッションにフォローアップメッセージを送信し、追加の指示やフィードバックを提供します。                                                                                                                 | `jules-extension.sendMessage`       |
| **計画の承認**           | 実行前にJulesが生成した計画を確認し、承認します。                                                                                                                                                      | `jules-extension.approvePlan`       |
| **設定を開く**           | 拡張機能の設定ページを素早く開き、自動更新やカスタムプロンプトなどのオプションを設定します。                                                                                                              | `jules-extension.openSettings`      |
| **セッションの削除**     | ローカルキャッシュからセッションを削除し、セッションリストを整理します。                                                                                                                                                | `jules-extension.deleteSession`     |

## 📦 Installation

Install from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)

Or search for "Jules Extension" in VS Code Extensions view.

### From Marketplace (Recommended)

1. Search for "Jules Extension" in the VSCode Marketplace
2. Click the `Install` button

### From VSIX File (Manual Install)

If you want to try the latest features that are not yet published on the Marketplace, you can download and install the `.vsix` file directly from the releases page.

1. **Go to the Releases Page:**
   Visit [GitHub Releases](https://github.com/your-repo/jules-extension/releases) and find the latest release version.

2. **Download the VSIX File:**
   Download the `.vsix` file (e.g., `jules-extension-0.1.0.vsix`) from the `Assets`.

3. **Install in VSCode:**
   - Open VSCode.
   - Go to the `Extensions` view (`Ctrl+Shift+X`).
   - Click the `...` (More Actions) menu at the top of the view and select `Install from VSIX...`.
   - Select the downloaded `.vsix` file to install.

## 🔑 Getting Your API Key

To use the Jules Extension, you need a Jules API key. Follow these steps to get one:

1. **Create an Account:**

   - Go to the [Jules Official Website](https://jules.google/docs).
   - Sign up for a new account or log in if you already have one.

2. **Generate API Key:**

   - Navigate to the "API Keys" or "Developer Settings" section in your account dashboard.
   - Click on "Create a new secret key".
   - Give your key a descriptive name (e.g., "VSCode Extension") and generate it.

3. **Copy Your Key:**
   - Your new API key will be displayed. Copy it to your clipboard.
   - If you need to view your key again later, you can always find it on your Jules settings page.

> **Important:** Treat your API key like a password. Do not share it publicly or commit it to version control.

## 認証

### OAuthサインイン (推奨) ✅

`Jules: Sign in to GitHub` コマンドを使用してください。

**利用方法:**

1. コマンドパレット (`Cmd+Shift+P`)
2. `Jules: Sign in to GitHub` を実行
3. ブラウザで認証

---

### GitHub PAT (認証用・非推奨) ⚠️

**PATを使用した認証は非推奨となり、将来のバージョンで削除される予定です。**

OAuthサインイン (`Jules: Sign in to GitHub`) への移行をお願いします。

### PRステータス確認用のトークン

プルリクエストのステータスを非公開リポジトリで確認する場合、追加でGitHubトークンが必要です。
`Jules: Set GitHub Token (for PR Status)` コマンドを使用し、`repo`スコープを持つトークンを安全に設定してください。

## ⚙️ 拡張機能の設定

本拡張機能では、以下の設定が利用可能です:

- `jules-extension.apiKey`: Jules APIの認証用APIキー（安全に保管されます）
- `jules-extension.autoRefresh.enabled`: セッションリストの自動更新を有効にする（デフォルト: false）
- `jules-extension.autoRefresh.interval`: 自動更新の間隔（秒）（デフォルト: 30, 最小: 10）
- `jules-extension.customPrompt`: Julesへのすべてのメッセージの先頭に自動的に付加されるカスタムプロンプト。永続的な指示として機能します。
- `jules-extension.hideClosedPRSessions`: クローズまたはマージされたプルリクエストを持つセッションをセッションリストから自動的に非表示にします（デフォルト: true）
- `jules.defaultBranch`: Julesセッション作成時のデフォルトブランチ選択の挙動を設定します（`current`, `default`, `main`から選択）
- `jules.githubPat`: [認証用・非推奨] GitHub Personal Access Token。`Jules: Sign in to GitHub`コマンドによるOAuth認証が推奨されます。
- `jules-extension.githubToken`: [PRステータス確認用・非推奨] プルリクエストのステータス確認用のGitHubトークン。セキュアな保管のために`Jules: Set GitHub Token`コマンドを使用してください。

## Quick Start

1. Press `Ctrl + Shift + P` (or `Cmd + Shift + P`) to open the Command Palette.
2. Run `> Jules: Set Jules API Key` and enter your API key.
3. Click the `$(robot)` icon in the sidebar to open the Jules Sessions View.
4. Run `> Jules: Create Jules Session` to start your first coding session!

## ⚠️ Important Notes

- **Card Block Rendering:** When using features that are displayed as card blocks, please be mindful of the content's structure to ensure it renders correctly.

## コマンド

- `Jules: Set Jules API Key` - API認証情報を設定します
- `Jules: Verify Jules API Key` - API接続をテストします
- `Jules: List Jules Sources` - 利用可能なソースを一覧表示します
- `Jules: Create Jules Session` - 新しい分析セッションを開始します
- `Jules: Refresh Jules Sessions` - セッションリストを再読み込みします
- `Jules: Show Jules Activities` - セッションのアクティビティを表示します
- `Jules: Refresh Jules Activities` - アクティビティビューを更新します
- `Jules: Send Message to Jules Session` - アクティブなセッションにフォローアップの指示を送信します
- `Jules: Approve Jules Plan` - 生成された計画を実行用に承認します
- `Jules: Open Jules Settings` - Julesの拡張機能設定を開きます
- `Jules: Delete Session from Local Cache` - ローカルキャッシュからセッションを削除します
- `Jules: Set GitHub Token (for PR Status)` - GitHubトークンを設定します（PRステータス確認用）
- `Jules: Clear Jules Cache` - Julesのキャッシュをクリアします
- `Jules: Sign in to GitHub` - GitHubにサインインします

## 📚 Links

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHub Repository](https://github.com/is0692vs/jules-extension.git)
- [Report Issues](https://github.com/is0692vs/jules-extension/issues)

## 🤝 Contribution

This project is just getting started. We welcome all forms of contribution, including bug reports, feature suggestions, and pull requests!
Please check the Issue Tracker and Pull Requests.

## 📝 License

[MIT](LICENSE)
