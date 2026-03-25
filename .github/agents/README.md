# Sub-Agents Directory

This directory contains instructions and context for various AI sub-agents that operate within this repository.

## Available Agents

- [**Developer Agent**](./developer.md): Core coding sub-agent. Responsible for implementing features and fixing bugs in `src/`.
- [**Investigator Agent**](./investigator.md): Responsible for code research, bug tracing, and architectural mapping.
- [**Tester Agent**](./tester.md): Responsible for writing, running, and verifying tests.
- [**PR Manager Agent**](./pr-manager.md): Responsible for creating pull requests, ensuring readiness, and merging.
- [**PR Reviewer Agent**](./reviewer.md): Responsible for responding to review comments and resolving threads.
- [**CI Monitor Agent**](./ci-monitor.md): Responsible for tracking CI checks and ensuring they pass before merge.
- [**PR Review Closure Loop**](./pr-review-closure-loop.md): Dedicated loop agent for ADDRESS/IGNORE_WITH_REASON triage, thread replies, resolution, and CI+mergeability checks until completion.
- [**PR Consolidation Playbook**](./pr-consolidation-playbook.md): Workflow for consolidating similar PRs into fewer destination PRs while preserving traceability.

These agents follow the core principles outlined in the root `AGENTS.md` and `.github/copilot-instructions.md`.
