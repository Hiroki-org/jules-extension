# Change Log

All notable changes to the "jules-extension" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.1.1] - 2025-11-21

### Changed
- Updated `README.md` to match the latest commands and features available in `package.json`.
- Improved Japanese localization and readability of the documentation.
- Added a note about PAT authentication being deprecated in favor of OAuth.

## [1.0.8] - 2025-11-16

- Bump package version to `1.0.8`.
- CI and workflows: cross-platform compatibility and linting improvements (set default `shell: bash`, improved caching and checks).
- Gemini workflows: Added new `language` input (default `ja`) across invocation, review, and triage workflows to force Japanese output.
- Reusability: Workflows now accept GCP/Gemini `inputs` (with `vars.*` fallbacks) and introduced `gemini-triage-bulk.yml` to enable bulk triage via `workflow_call`.
- Output handling: Added `collect_outputs`/`collect_selected` steps to convert environment outputs written by the Gemini CLI into step and job outputs (e.g., `triaged_issues`, `selected_labels`) so downstream jobs can use `needs.*.outputs.*`.
- Fixed: YAML parse errors caused by stray LLM instruction fragments in scheduled triage workflow and various `with:`/indent issues.
- Security: Hardened steps to avoid accidental writes in fork contexts (unset `GITHUB_TOKEN` for untrusted runs) and explicitly require tokens for write operations.
