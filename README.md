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

| Feature                   | Description                                                                                              | Command                                   |
| :------------------------ | :------------------------------------------------------------------------------------------------------- | :---------------------------------------- |
| **Authentication**        | Securely connect to Jules by signing in with your GitHub account (OAuth).                                | `Jules: Sign in to GitHub`                |
| **API Key Management**    | Set and verify your Jules API key directly within VSCode.                                                | `Jules: Set Jules API Key`                |
| **Session Management**    | Create new coding sessions, view past sessions, and monitor progress in real-time from the sidebar.      | `Jules: Create Jules Session`             |
| **Real-time Interaction** | Send messages, approve plans, and view detailed activity logs for any active session.                    | `Jules: Send Message to Jules Session`    |
| **Source Listing**        | Browse available data sources that Jules can work with.                                                  | `Jules: List Jules Sources`               |
| **View Management**       | Refresh session and activity views to get the latest updates.                                            | `Jules: Refresh Jules Sessions`           |
| **Cache Management**      | Clear the local cache to resolve potential data inconsistencies.                                         | `Jules: Clear Jules Cache`                |
| **Settings Access**       | Quickly open the extension's settings page to customize its behavior.                                    | `Jules: Open Jules Settings`              |

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

## 🔑 Setup

To use the Jules Extension, you'll need to configure two things: a Jules API Key and GitHub Authentication.

### 1. Get and Set Your Jules API Key

First, you need a Jules API key to connect to the service.

1.  **Create an Account:**
    *   Go to the [Jules Official Website](https://jules.google/docs).
    *   Sign up for a new account or log in if you already have one.

2.  **Generate API Key:**
    *   Navigate to the "API Keys" or "Developer Settings" section in your account dashboard.
    *   Click on "Create a new secret key".
    *   Give your key a descriptive name (e.g., "VSCode Extension") and generate it.

3.  **Copy and Set Your Key:**
    *   Copy your new API key to your clipboard.
    *   In VSCode, open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    *   Run the `Jules: Set Jules API Key` command and paste your key.

> **Important:** Treat your API key like a password. Do not share it publicly or commit it to version control.

### 2. Authenticate with GitHub

To allow Jules to interact with your repositories (e.g., to check PR status), you need to authenticate with GitHub.

#### OAuth Sign-in (Recommended) ✅

This is the easiest and most secure method.

1.  Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2.  Run the command `Jules: Sign in to GitHub`.
3.  You will be redirected to your browser to authorize the extension.

#### GitHub PAT (Deprecated) ⚠️

**Using a Personal Access Token (PAT) is deprecated and will be removed in a future version.** Please migrate to the recommended OAuth sign-in method for better security and a smoother experience.

## ⚙️ Extension Settings

This extension provides the following settings, which can be configured in your VSCode settings (`settings.json`):

| Setting                          | Description                                                                                             | Default     |
| :------------------------------- | :------------------------------------------------------------------------------------------------------ | :---------- |
| `jules-extension.apiKey`         | Your Jules API key. It's recommended to set this via the `Jules: Set Jules API Key` command.              | `""`        |
| `jules-extension.autoRefresh.enabled` | Enable automatic background refresh of the sessions list.                                               | `false`     |
| `jules-extension.autoRefresh.interval` | The interval in seconds for auto-refreshing the sessions list.                                          | `30`        |
| `jules-extension.customPrompt`   | A custom prompt to automatically prepend to every message sent to Jules.                                | `""`        |
| `jules-extension.hideClosedPRSessions` | Automatically hide sessions with closed or merged pull requests from the list.                          | `true`      |
| `jules.defaultBranch`            | Default branch behavior when creating a session (`current`, `default`, `main`).                         | `current`   |
| `jules.githubPat`                | **[DEPRECATED]** Use the `Jules: Sign in to GitHub` command instead.                                      | `""`        |

## Quick Start

1.  Press `Ctrl + Shift + P` (or `Cmd + Shift + P`) to open the Command Palette.
2.  Run `> Jules: Set Jules API Key` and enter your API key.
3.  Run `> Jules: Sign in to GitHub` to authenticate.
4.  Click the `$(robot)` icon in the sidebar to open the Jules Sessions View.
5.  Run `> Jules: Create Jules Session` to start your first coding session!

## ⚠️ Important Notes

- **Card Block Rendering:** When using features that are displayed as card blocks, please be mindful of the content's structure to ensure it renders correctly.

## Commands

All commands are accessible from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).

-   `Jules: Sign in to GitHub` - Authenticate with your GitHub account (OAuth).
-   `Jules: Set Jules API Key` - Configure your API credentials.
-   `Jules: Verify Jules API Key` - Test your API connection.
-   `Jules: List Jules Sources` - Browse available sources.
-   `Jules: Create Jules Session` - Start a new coding session.
-   `Jules: Refresh Jules Sessions` - Reload the sessions list from the server.
-   `Jules: Send Message to Jules Session` - Post follow-up instructions to an active session.
-   `Jules: Approve Jules Plan` - Approve a generated plan for execution.
-   `Jules: Show Jules Activities` - View the detailed activity log for a session.
-   `Jules: Refresh Jules Activities` - Update the activities view with the latest progress.
-   `Jules: Open Jules Settings` - Open the extension's settings page.
-   `Jules: Delete Session from Local Cache` - Remove a session from the local view (does not affect the server).
-   `Jules: Clear Jules Cache` - Clear all locally cached data for the extension.
-   `Jules: Set GitHub Token (for PR Status)` - **[DEPRECATED]** Set a GitHub PAT.

## 📚 Links

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHub Repository](https://github.com/is0692vs/jules-extension.git)
- [Report Issues](https://github.com/is0692vs/jules-extension/issues)

## 🤝 Contribution

This project is just getting started. We welcome all forms of contribution, including bug reports, feature suggestions, and pull requests!
Please check the Issue Tracker and Pull Requests.

## 📝 License

[MIT](LICENSE)
