# Jules Extension for VSCode

[![VSCode Extension](https://img.shields.io/badge/VSCode-Extension-blue.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER.jules-extension)
[![Status](https://img.shields.io/badge/status-development-yellow.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> "Experience the future of coding with Google Jules in VSCode"

Jules Extension is an extension that allows you to operate Google's AI coding agent **Jules** directly from within VSCode.
Welcome an intelligent companion into your coding workflow.

**Read this in other languages:**

- [Español (Spanish)](./docs/es/README.md)
- [Français (French)](./docs/fr/README.md)
- [日本語 (Japanese)](./docs/ja/README.md)
- [한국어 (Korean)](./docs/ko/README.md)
- [中文 (Chinese)](./docs/zh/README.md)

## ✨ Concept

This extension was created to take your development experience to the next level.

- **Seamless Integration:** Access Jules' powerful features without leaving your familiar VSCode environment.
- **Real-time Collaboration:** Everything from creating coding sessions to checking progress, in real-time.
- **Productivity Boost:** Let Jules handle tedious tasks while you focus on creative work.

## 🚀 Key Features

| Feature                     | Description                                                                                                                                                                                                                            | Command / Icon                                   |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- |
| **API Key Setup**           | Set up your API key to connect to your Jules account on first use. The key is securely stored in VSCode's SecretStorage and automatically used for all subsequent requests.                                                            | `jules-extension.setApiKey`                      |
| **GitHub Token Setup**      | Set up your GitHub Personal Access Token to enable PR status checking. The token is securely stored and used to automatically detect when pull requests are closed or merged, helping keep your session list clean.                    | `jules-extension.setGithubToken`                 |
| **Session Management**      | Request new coding tasks from Jules with the `> Jules: Create Session` command. Past sessions are also listed, allowing you to resume work or review the history of completed tasks at any time.                                       | `jules-extension.createSession`                  |
| **Real-time Monitoring**    | See Jules' current work status (`Running`, `Active`, `Done`, etc.) at a glance in the dedicated view added to the sidebar. No more switching between browser and editor repeatedly.                                                    | `julesSessionsView`                              |
| **Progress Updates**        | When you're curious about how far Jules has progressed, click the `↻` (refresh) button. Instantly retrieve and update the session status and the latest activity list performed by Jules.                                              | `jules-extension.refreshSessions`                |
| **Activity Display**        | When you select a session, you can check detailed logs of commands Jules executed, files edited, thought processes, and more. Provides a transparent development experience, as if you're peering into Jules' thinking.                | `jules-extension.showActivities`                 |
| **Smart Session Filtering** | Automatically hide completed sessions (those with closed/merged PRs or failed/cancelled states) from the session list. Prevents unnecessary status checks and keeps your workspace focused on active work. Can be toggled in settings. | `jules-extension.hideClosedPRSessions` (setting) |

## 📦 Installation

Install from [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension).

Or search for "Jules Extension" in VS Code's Extensions view.

### From Marketplace (Recommended)

1.  Search for "Jules Extension" in the VSCode Marketplace
2.  Click the `Install` button

## 🔑 Obtaining an API Key

To use Jules Extension, you need a Jules API key. Follow these steps to obtain one:

1.  **Create an Account:**

    - Visit the [Jules Official Site](https://jules.google/docs).
    - Register a new account or log in with an existing account.

2.  **Generate an API Key:**

    - In your account dashboard, navigate to the "API Keys" or "Developer Settings" section.
    - Click "Create New Secret Key".
    - Give the key an easy-to-understand name (e.g., "VSCode Extension") and generate it.

3.  **Copy the Key:**
    - Your new API key will be displayed. Copy it to your clipboard.
    - If you need to check the key again later, you can always view it in Jules' settings page.

> **Important:** Treat your API key like a password. Do not share it publicly or commit it to version control.

## Quick Start

1.  Open the Command Palette with `Ctrl + Shift + P` (or `Cmd + Shift + P`).
2.  Run `> Jules: Set Jules API Key` to set up your API key.
3.  (Optional) Run `> Jules: Set GitHub Token` to enable PR status checking and automatic session filtering.
4.  Click the `$(robot)` icon in the sidebar to open the Jules Sessions View.
5.  Run `> Jules: Create Jules Session` to start your first coding session!

## 📚 References

- [Jules Official Site](https://jules.google/docs)
- [Jules API Documentation](https://developers.google.com/jules/api)

## 🤝 Contribution

This project is just getting started. We welcome all forms of contribution, including bug reports, feature suggestions, and pull requests!
Please check out the Issue Tracker and Pull Requests.

## 🔗 Links

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=HirokiMukai.jules-extension)
- [GitHub Repository](https://github.com/is0692vs/jules-extension.git)
- [Report Issues](https://github.com/is0692vs/jules-extension/issues)

## 📝 License

[MIT](LICENSE)
