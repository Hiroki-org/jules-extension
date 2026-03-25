---
name: PR Consolidation Playbook
description: "Use when consolidating multiple similar open PRs into fewer destination PRs with clear traceability and preserved review/CI signals."
tools:
  - execute
  - read
  - search
  - github_repo
argument-hint: "Provide owner/repo and consolidation policy (grouping keys, destination preference, merge strategy)."
user-invocable: true
---

# PR Consolidation Playbook

This playbook defines a repeatable method for consolidating similar open PRs in `Hiroki-org/jules-extension`.

## Objective

- Group related PRs by touched scope and intent.
- Select one destination PR per group.
- Merge source branches into destination branch.
- Close absorbed PRs with explicit traceability.

## Steps

1. Inventory open PRs.
2. Group by similarity:
   - Primary: changed files / affected modules
   - Secondary: intent (`fix`, `test`, `refactor`, `docs`)
3. Choose destination PR:
   - prefer newest + most complete CI/review state
4. Integrate source branches into destination branch.
5. Resolve conflicts using destination behavior as baseline.
6. Run targeted verification for touched scope.
7. Push destination and update PR description with absorbed PR list.
8. Comment and close absorbed PRs:
   - `このPRは #<destination> に統合しました。以降のレビューは統合先PRでお願いします。`
9. Run post-push review/CI closure loop until green + unresolved `0`.

## Suggested Destination PR Body Section

```md
## Consolidation

This PR consolidates related PRs:
- #...
- #...

Notes:
- Merge to main is deferred until consolidated review and CI complete.
```
