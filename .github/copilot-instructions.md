---
description: "Jules Extension - VS Code extension for managing Google Jules sessions, GitHub PR workflows, activity views, and local repository operations."
applyTo: "**"
---

# Jules Extension - Copilot Instructions

**Jules Extension** is a TypeScript-based VS Code extension for creating, monitoring, and reviewing Google Jules coding sessions directly inside VS Code. It also handles GitHub authentication, PR status checks, diff viewing, and branch operations. This repository is a single-package extension project. Source code lives in `src/`, production output lives in `dist/`, and compiled test output lives in `out/`.

In this repository, the job is not finished when a PR is opened. A task is only complete after review conversations have replies, conversations are resolved, and CI has been monitored through completion. The `gh` workflow and the repeated `sleep 300 && gh pr checks <PR#>` loop are mandatory operating procedures here.

## Quick Reference

| Item | Tech / Responsibility | Location |
| --- | --- | --- |
| Extension core | TypeScript, VS Code Extension API | `src/extension.ts` |
| Jules API integration | Google Jules API client | `src/julesApiClient.ts` |
| GitHub integration | OAuth, repo URL, PR helpers | `src/githubAuth.ts`, `src/githubUtils.ts` |
| UI | Tree View, Chat View, Document Provider | `src/chatView.ts`, `src/planDocumentProvider.ts` |
| Session diff support | Diff, changeset, artifacts | `src/sessionArtifacts.ts`, `src/sessionContextMenuArtifacts.ts` |
| Security helpers | Log sanitization, URL credential stripping | `src/securityUtils.ts` |
| Tests | Mocha + `vscode-test` | `src/test/` |
| Build | esbuild | `esbuild.js`, `dist/` |
| CI | GitHub Actions, pnpm, Node 20/22 | `.github/workflows/` |

---

## Project Overview

This project is not a monorepo. The repository contains a single VS Code extension package with its code and configuration at the root.

- The extension manages Jules sessions, activities, chat, plan approval, PR opening, and diff inspection inside VS Code.
- GitHub auth and PR visibility are first-class features. Remote branch state, PR URL resolution, and GitHub sign-in flows are easy to break and must be treated carefully.
- Security-sensitive logging behavior is explicit in this codebase. Sanitization and credential stripping are part of the supported behavior, not optional cleanup.
- Do not hand-edit generated outputs in `dist/` or `out/`. Edit `src/` and regenerate through the normal build and test flow.

## Key Files and Responsibilities

| Purpose | Path |
| --- | --- |
| Extension entry point and command registration | `src/extension.ts` |
| Jules API communication | `src/julesApiClient.ts` |
| GitHub auth flow | `src/githubAuth.ts` |
| GitHub URL and repo helpers | `src/githubUtils.ts` |
| Session context menu actions | `src/sessionContextMenu.ts` |
| Diff and changeset presentation | `src/sessionContextMenuArtifacts.ts` |
| Session artifact cache | `src/sessionArtifacts.ts` |
| Chat webview | `src/chatView.ts` |
| Plan review document provider | `src/planDocumentProvider.ts` |
| Security utilities | `src/securityUtils.ts` |
| Unit and integration tests | `src/test/*.ts` |

When changing implementation, always inspect the related test coverage in the same area.

---

## Setup and Core Commands

### Initial Setup

```bash
pnpm install --frozen-lockfile
```

### Development and Build

```bash
pnpm run check-types   # TypeScript type check
pnpm run lint          # ESLint on src
pnpm run compile       # type check + lint + esbuild
pnpm run package       # production packaging build
pnpm run watch         # esbuild and tsc watch
```

### Tests

```bash
pnpm run compile-tests # compile tests into out/
pnpm run test:unit     # fast unit test pass
pnpm test              # vscode-test based extension test run
```

`pnpm test` triggers `pretest`, which runs `compile-tests`, `compile`, and `lint` first. It is slower and should be treated as a final verification step after targeted validation with `pnpm run test:unit`.

---

## Test Code Expectations

Tests are important in this repository. Do not treat test updates as optional when changing behavior.

### Test Layout

- Unit or module-focused tests: `src/test/*.unit.test.ts`
- Broader behavior or integration-style tests: `src/test/*.test.ts`
- VS Code mocks: `src/test/vscodeMock.ts`
- Security testing reference: `TESTING_GUIDE.md`

### Representative Test Files

- `src/test/activityUtils.unit.test.ts`
- `src/test/githubUtils.unit.test.ts`
- `src/test/julesApiClient.unit.test.ts`
- `src/test/securityUtils.unit.test.ts`
- `src/test/githubIntegration.test.ts`
- `src/test/extension.test.ts`
- `src/test/planNotification.unit.test.ts`

### Test Policy

- Always add or update tests for the module you changed.
- For changes in central modules such as `src/extension.ts`, `src/githubAuth.ts`, `src/sessionArtifacts.ts`, or `src/securityUtils.ts`, do not stop at unit tests if broader extension behavior may be affected. Run `pnpm test` when appropriate.
- For bug fixes, prefer adding a reproducing test first and then applying the fix.
- For security-related changes, review `TESTING_GUIDE.md` and do not weaken existing expectations around sanitization, credential handling, or edge cases.

### Minimum Verification for Most Changes

```bash
pnpm run check-types
pnpm run lint
pnpm run test:unit
```

### Recommended Verification Before PR

```bash
pnpm run check-types
pnpm run lint
pnpm run test:unit
pnpm test
pnpm run package
```

---

## CI Expectations

GitHub Actions currently runs at least the following:

- `lint`: Ubuntu + Node 20 running `pnpm audit`, `pnpm run check-types`, and `pnpm run lint`
- `test-unit`: Node 20/22 running `pnpm run test:unit`
- `build-check`: Node 20/22 running `pnpm run package`
- `test-linux`: Linux running `xvfb-run -a pnpm test`
- `test-macos`: macOS running `pnpm test`
- `test-windows`: Windows running `pnpm test`

Do not assume local success is enough. Cross-platform differences, VS Code test environment behavior, timing, path handling, and line endings can still break CI.

---

## Rules When Starting Work

### New Task

For new feature work or a fresh bug fix, always create a new branch first.

```bash
git switch -c feature/<short-topic>
```

Then carry the work through implementation, testing, commit, push, and PR creation.

### Existing PR or Existing Branch Follow-Up

For follow-up work on an existing PR, first check out the correct branch and only then make changes. Do not commit directly on `main`.

---

## PR Creation and Review Handling

### When Opening a New PR

1. Create a working branch.
2. Implement the change and update tests.
3. Run local verification.
4. Push the branch.
5. Open the PR with `gh pr create`.
6. Track CI and review conversations until completion.

### Review Handling Rules

- Do not leave PR review comments unanswered. Every conversation needs an explicit reply.
- If you accept the feedback, reply with what changed and which commit contains the fix.
- If you defer or decline the feedback, say so explicitly and explain why. Link follow-up work when possible.
- The target state is zero unresolved conversations.
- Do not hide behind one generic PR-level reply when thread-level replies are needed.

### Example When Accepting and Fixing

```bash
git add <changed-files>
git commit -m "Address review: <subject>"
git push
gh pr comment <PR#> --body "Applied in commit $(git rev-parse --short HEAD): <brief description>"
```

### Example When Deferring

```bash
gh pr comment <PR#> --body "Deferred in this PR: <reason>. Follow-up: <issue-or-plan>"
```

If the thread must be resolved explicitly, use the appropriate GitHub conversation API or GitHub UI and close the conversation after replying.

---

## CI Check Loop: Mandatory, Not Optional

In this repository, checking `gh pr checks` once after push is not enough. You must actively follow CI until it finishes. The `gh` commands and the repeated `sleep 300 && gh pr checks <PR#>` loop are part of the required workflow.

When you push additional commits to an existing PR, do not treat `git push` and CI follow-up as separate tasks. Push and the follow-up `gh` checks must be executed as one continuous operation.

### Required Sequence

1. Watch immediately after push:

```bash
gh pr checks <PR#> --watch
```

1. After the watch completes, verify again:

```bash
OWNER="<owner>"
REPO="<repo>"
PR_NUMBER="<PR#>"

echo "Polling until all conversations are resolved and CI is fully green..."
while true; do
  unresolved_threads="$(gh api graphql -f query='query($owner:String!, $repo:String!, $number:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviewThreads(first:100) { nodes { isResolved } } } } }' -F owner="$OWNER" -F repo="$REPO" -F number="$PR_NUMBER" --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')"
  pending_checks="$(gh pr checks "$PR_NUMBER" --json bucket --jq '[.[] | select(.bucket == "pending")] | length')"
  failing_checks="$(gh pr checks "$PR_NUMBER" --json bucket --jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length')"

  if [ "$unresolved_threads" -eq 0 ] && [ "$pending_checks" -eq 0 ] && [ "$failing_checks" -eq 0 ]; then
    gh pr checks "$PR_NUMBER"
    break
  fi

  echo "Unresolved conversations: $unresolved_threads"
  echo "Pending checks: $pending_checks"
  echo "Failing or cancelled checks: $failing_checks"
  sleep 300
done
```

1. If checks are still running, conversations are still open, or any required check fails, keep polling until the loop exits cleanly.
1. If anything fails, inspect the failing logs immediately and fix the issue.
1. After pushing a fix, start over from `gh pr checks <PR#> --watch`.

### Standard Sequence to Copy

```bash
OWNER="<owner>"
REPO="<repo>"
PR_NUMBER="<PR#>"

gh pr view "$PR_NUMBER" &&
git push &&
gh pr checks "$PR_NUMBER" --watch &&
echo "Polling until unresolved conversations reach zero and CI is fully green..." &&
while true; do
  unresolved_threads="$(gh api graphql -f query='query($owner:String!, $repo:String!, $number:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviewThreads(first:100) { nodes { isResolved } } } } }' -F owner="$OWNER" -F repo="$REPO" -F number="$PR_NUMBER" --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')" &&
  pending_checks="$(gh pr checks "$PR_NUMBER" --json bucket --jq '[.[] | select(.bucket == "pending")] | length')" &&
  failing_checks="$(gh pr checks "$PR_NUMBER" --json bucket --jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length')"

  if [ "$unresolved_threads" -eq 0 ] && [ "$pending_checks" -eq 0 ] && [ "$failing_checks" -eq 0 ]; then
    gh pr checks "$PR_NUMBER"
    break
  fi

  echo "Unresolved conversations: $unresolved_threads"
  echo "Pending checks: $pending_checks"
  echo "Failing or cancelled checks: $failing_checks"
  sleep 300
done
```

### Final Check Before Merge

Do not do a one-shot merge decision. Right before merge, run at least:

```bash
OWNER="<owner>"
REPO="<repo>"
PR_NUMBER="<PR#>"

gh pr checks "$PR_NUMBER"
gh api graphql -f query='query($owner:String!, $repo:String!, $number:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviewThreads(first:100) { nodes { isResolved } } } } }' -F owner="$OWNER" -F repo="$REPO" -F number="$PR_NUMBER" --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length'
```

Only merge after all checks are green, all review conversations are resolved, and approvals are in place.

---

## Merge Readiness Checklist

- You are working on a branch, not directly on `main`
- Tests were added or updated for the change
- `pnpm run check-types` passed
- `pnpm run lint` passed
- Required tests passed
- CI is fully green
- Every review conversation has a reply
- Unresolved conversations are at zero
- Required approvals are in place

---

## Change Safety Notes

- Anything using the VS Code API may fail only under `vscode-test`, not under plain Node execution. Plan verification accordingly.
- GitHub auth, branch handling, and PR URL logic must cover non-happy paths such as missing tokens and missing remote branches.
- Do not regress `sanitizeForLogging` or `stripUrlCredentials`.
- Be careful around caching, polling, and auto-refresh behavior. Race conditions and stale state are realistic failure modes in this project.

## Agent Summary

- Read `.github/copilot-instructions.md` first
- Create a branch for new work
- Update tests alongside implementation
- After opening a PR, follow both review conversations and CI to completion
- Do not skip the repeated `sleep 300 && gh pr checks <PR#>` verification loop
