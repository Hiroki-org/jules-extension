# Change Log

All notable changes to the "jules-extension" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release

## [1.1.2] - 2024-07-22

### Fixed

- Fixed an issue where the `setGitHubPat` command was not properly validating the PAT format.

## [1.1.1] - 2024-07-21

### Changed

- Improved the user experience for setting the GitHub token by providing more informative messages.
- Updated the `README.md` to reflect the latest changes and improvements.

## [1.1.0] - 2024-07-20

### Added

- Introduced OAuth sign-in for GitHub, providing a more secure and convenient way to authenticate.
- Added a new command `jules-extension.signInGitHub` to initiate the OAuth flow.
- Added a new setting `jules.defaultBranch` to control the default branch selection behavior.

### Changed

- Deprecated the `jules.githubPat` setting in favor of the new OAuth sign-in method.
- The `jules-extension.setGitHubPat` command now shows a deprecation warning.

## [1.0.9] - 2024-07-19

### Added

- Added a new command `jules-extension.clearCache` to clear the local cache for sources and branches.
- Added a new setting `jules-extension.hideClosedPRSessions` to automatically hide sessions with closed or merged pull requests.

### Changed

- Improved the performance of listing sources by introducing a local cache.
- The `listSources` command now uses the cache to provide a faster response.

## [1.0.8] - 2024-07-18

### Changed

- Bump package version to `1.0.8`.
- CI and workflows: cross-platform compatibility and linting improvements.
- Gemini workflows: Added new `language` input to force Japanese output.
- Reusability: Workflows now accept GCP/Gemini `inputs`.
- Output handling: Added `collect_outputs`/`collect_selected` steps to convert environment outputs into step and job outputs.

### Fixed

- YAML parse errors caused by stray LLM instruction fragments.

### Security

- Hardened steps to avoid accidental writes in fork contexts.
