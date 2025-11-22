# Jules Extension for VSCode

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
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

| Feature                      | Description                                                                                                                                                                                      | Command / Icon                          |
| :--------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------- |
| **Set API Key**              | Securely stores your Jules API key using VSCode's SecretStorage.                                                                                                                                 | `Jules: Set Jules API Key`              |
| **GitHub Authentication**    | Sign in to GitHub with OAuth to allow Jules to interact with your repositories.                                                                                                                | `Jules: Sign in to GitHub`              |
| **Session Management**       | Create new coding sessions, view past sessions, and monitor their status (`Running`, `Active`, `Done`, etc.) directly in the sidebar.                                                           | `Jules: Create Jules Session` / `$(add)` |
| **Real-time Monitoring**     | The dedicated sidebar provides an at-a-glance view of all your Jules sessions.                                                                                                                   | `Jules Sessions` View                   |
| **Activity Viewer**          | Select a session to see a detailed log of Jules's actions, including commands executed, files edited, and thought processes.                                                                   | `Jules: Show Jules Activities`          |
| **Interactive Communication**| Send messages to an active session to provide further instructions or approve plans.                                                                                                             | `Jules: Send Message` / `$(comment)`    |
| **Refresh**                  | Manually refresh the list of sessions and activities to get the latest updates.                                                                                                                  | `$(refresh)` in the view title        |
| **Cache Management**         | Clear the local cache to resolve potential data inconsistencies.                                                                                                                                 | `Jules: Clear Jules Cache`              |
| **Settings Management**      | Easily access and manage all Jules-related settings.                                                                                                                                             | `Jules: Open Jules Settings`            |

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

## 🔒 Authentication

This extension requires authentication to interact with both the Jules API and GitHub.

### Jules API Key

Before using the extension, you must set your Jules API key.

1.  **Get API Key**: Obtain your key from the [Jules Official Website](https://jules.google/docs).
2.  **Set API Key**: Run the command `Jules: Set Jules API Key` from the Command Palette (`Ctrl+Shift+P`) and paste your key. It will be stored securely in VSCode's `SecretStorage`.

### GitHub Authentication

To allow Jules to access repositories and check PR statuses, you need to authenticate with GitHub.

-   **OAuth Sign-in (Recommended)**: The primary and recommended method is to use the `Jules: Sign in to GitHub` command. This will open a browser window to authorize the extension via OAuth, which is more secure and convenient.
-   **GitHub PAT (Deprecated)**: While the `Jules: Set GitHub Token` command exists for using a Personal Access Token (PAT), this method is deprecated and will be removed in a future version. Please migrate to the OAuth sign-in flow.

## ⚙️ Extension Settings

This extension contributes the following settings to customize your experience:

| Setting                            | Description                                                                                                                              | Default   |
| :--------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- | :-------- |
| `jules-extension.apiKey`           | API Key for Jules API. It's recommended to set this via the `Jules: Set Jules API Key` command.                                          | `""`      |
| `jules-extension.autoRefresh.enabled` | Enable automatic refresh of the Jules sessions list.                                                                                     | `false`   |
| `jules-extension.autoRefresh.interval`  | The interval in seconds for auto-refreshing the sessions list.                                                                           | `30`      |
| `jules-extension.customPrompt`     | A custom prompt to automatically prepend to every message sent to Jules. This acts as a persistent instruction.                            | `""`      |
| `jules-extension.hideClosedPRSessions` | Automatically hide sessions with closed or merged pull requests from the session list.                                                   | `true`    |
| `jules.defaultBranch`              | Default branch selection behavior when creating a Jules session (`current`, `default`, or `main`).                                       | `current` |
| `jules-extension.githubToken`      | **[DEPRECATED]** Use the `Jules: Set GitHub Token` command instead for secure storage.                                                       | `""`      |
| `jules.githubPat`                  | **[DEPRECATED]** Use the `Jules: Sign in to GitHub` command instead.                                                                     | `""`      |

## Quick Start

1. Press `Ctrl + Shift + P` (or `Cmd + Shift + P`) to open the Command Palette.
2. Run `> Jules: Set Jules API Key` and enter your API key.
3. Click the `$(robot)` icon in the sidebar to open the Jules Sessions View.
4. Run `> Jules: Create Jules Session` to start your first coding session!

## ⚠️ Important Notes

- **Card Block Rendering:** When using features that are displayed as card blocks, please be mindful of the content's structure to ensure it renders correctly.

## Commands

- `Jules: Set Jules API Key` - Configure your API credentials.
- `Jules: Verify Jules API Key` - Test your API connection.
- `Jules: List Jules Sources` - Browse available data sources for Jules.
- `Jules: Create Jules Session` - Start a new coding session with Jules.
- `Jules: Refresh Jules Sessions` - Reload the list of your Jules sessions.
- `Jules: Show Jules Activities` - View detailed activity logs for a selected session.
- `Jules: Refresh Jules Activities` - Update the activities view for the current session.
- `Jules: Send Message to Jules Session` - Send follow-up instructions to an active session.
- `Jules: Approve Jules Plan` - Review and approve a plan generated by Jules.
- `Jules: Open Jules Settings` - Open the extension's settings page.
- `Jules: Delete Session from Local Cache` - Remove a session from the local cache.
- `Jules: Set GitHub Token (for PR Status)` - Securely store your GitHub token to check PR status.
- `Jules: Clear Jules Cache` - Clear all cached Jules data.
- `Jules: Sign in to GitHub` - Authenticate with GitHub using OAuth.
- `Jules: [DEPRECATED] Set GitHub PAT` - A deprecated command for setting a GitHub Personal Access Token.

## 📚 Links

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHub Repository](https://github.com/is0692vs/jules-extension.git)
- [Report Issues](https://github.com/is0692vs/jules-extension/issues)

## 🤝 Contribution

This project is just getting started. We welcome all forms of contribution, including bug reports, feature suggestions, and pull requests!
Please check the Issue Tracker and Pull Requests.

## 📝 License

[MIT](LICENSE)
