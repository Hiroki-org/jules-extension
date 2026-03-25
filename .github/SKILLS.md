# Jules Extension Automation Skills Catalog

This document defines reusable operational skills for issue implementation, PR review closure, and CI follow-up in `Hiroki-org/jules-extension`.

## Table of Contents

1. [review-closure-loop](#review-closure-loop) – Close unresolved review conversations
2. [ci-check-loop](#ci-check-loop) – Track CI until completion
3. [pr-status-check](#pr-status-check) – Inspect blockers across open PRs
4. [commit-and-push](#commit-and-push) – Standardized commit workflow

---

## review-closure-loop

**Purpose**: Ensure each review conversation gets a thread-level reply and reaches resolved state.

**Typical Triggers**:
- PR review comments were posted
- `reviewDecision = CHANGES_REQUESTED`
- User asks: “close all review threads”

**Workflow**:

```bash
OWNER="Hiroki-org"
REPO="jules-extension"
PR_NUMBER="<PR#>"

# 1) Collect unresolved threads
gh api graphql -f query='
query($owner:String!, $repo:String!, $number:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      reviewThreads(first:100) {
        nodes {
          id
          isResolved
          comments(first:20) { nodes { databaseId author { login } body path line url } }
        }
      }
    }
  }
}' -F owner="$OWNER" -F repo="$REPO" -F number="$PR_NUMBER"

# 2) For each unresolved thread:
#    - ADDRESS: implement fix, commit, push, reply in thread
#    - IGNORE_WITH_REASON: reply with explicit reason + follow-up

# 3) Resolve each processed thread
gh api graphql -f query='
mutation($threadId:ID!) {
  resolveReviewThread(input:{threadId:$threadId}) { thread { id isResolved } }
}' -f threadId="<THREAD_ID>"
```

**Output**:
- Every unresolved thread has a reply
- Addressed items are committed and pushed
- Resolved thread count reaches zero

---

## ci-check-loop

**Purpose**: Continuously monitor PR checks until conversations and checks are both complete.

**Workflow**:

```bash
OWNER="Hiroki-org"
REPO="jules-extension"
PR_NUMBER="<PR#>"

# Optional warm-up watch with timeout guard so loop cap remains effective
if command -v timeout >/dev/null 2>&1; then
  timeout 300 gh pr checks "$PR_NUMBER" --watch --interval 10 || true
fi

count_unresolved_threads() {
  local owner="$1"
  local repo="$2"
  local pr_number="$3"
  local after=""
  local unresolved_total=0

  while true; do
    local response
    if [ -n "$after" ]; then
      response="$(gh api graphql -f query='query($owner:String!, $repo:String!, $number:Int!, $after:String) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviewThreads(first:100, after:$after) { nodes { isResolved } pageInfo { hasNextPage endCursor } } } } }' -F owner="$owner" -F repo="$repo" -F number="$pr_number" -f after="$after")"
    else
      response="$(gh api graphql -f query='query($owner:String!, $repo:String!, $number:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviewThreads(first:100) { nodes { isResolved } pageInfo { hasNextPage endCursor } } } } }' -F owner="$owner" -F repo="$repo" -F number="$pr_number")"
    fi

    local unresolved_in_page
    unresolved_in_page="$(echo "$response" | jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')"
    unresolved_total=$((unresolved_total + unresolved_in_page))

    local has_next
    has_next="$(echo "$response" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')"
    if [ "$has_next" != "true" ]; then
      break
    fi

    after="$(echo "$response" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')"
  done

  echo "$unresolved_total"
}

max_iterations=20

for iteration in $(seq 1 "$max_iterations"); do
  check_scope="--required"
  required_probe="$(gh pr checks "$PR_NUMBER" --required --json bucket 2>&1 || true)"
  if echo "$required_probe" | grep -qi "no required checks reported"; then
    check_scope=""
  elif ! echo "$required_probe" | jq -e . >/dev/null 2>&1; then
    check_scope=""
  fi

  unresolved_threads="$(count_unresolved_threads "$OWNER" "$REPO" "$PR_NUMBER")"
  pending_checks="$(gh pr checks "$PR_NUMBER" $check_scope --json bucket --jq '[.[] | select(.bucket == "pending")] | length')"
  failing_checks="$(gh pr checks "$PR_NUMBER" $check_scope --json bucket --jq '[.[] | select(.bucket == "fail" or .bucket == "failure" or .bucket == "cancel" or .bucket == "cancelled")] | length')"
  merge_state="$(gh pr view "$PR_NUMBER" --json mergeStateStatus --jq '.mergeStateStatus')"
  mergeable_state="$(gh pr view "$PR_NUMBER" --json mergeable --jq '.mergeable')"

  if [ "$unresolved_threads" -eq 0 ] && [ "$pending_checks" -eq 0 ] && [ "$failing_checks" -eq 0 ] && [ "$merge_state" != "DIRTY" ] && [ "$mergeable_state" = "MERGEABLE" ]; then
    gh pr checks "$PR_NUMBER"
    break
  fi

  echo "iteration=$iteration scope=${check_scope:-all} unresolved=$unresolved_threads pending=$pending_checks failing=$failing_checks mergeState=$merge_state mergeable=$mergeable_state"

  if [ "$iteration" -eq "$max_iterations" ]; then
    echo "Loop cap reached (${max_iterations} iterations). Human escalation required."
    break
  fi

  sleep 300
done
```

**Success Criteria**:
- `unresolved_threads = 0`
- `pending_checks = 0`
- `failing_checks = 0`
- `mergeStateStatus != DIRTY` and `mergeable == MERGEABLE`

---

## pr-status-check

**Purpose**: Report blockers across all open PRs.

**Workflow**:

```bash
gh pr list --state open --json number,title,headRefName,reviewDecision,mergeStateStatus,url
```

Then for each PR:

```bash
gh pr checks <PR#> --json name,bucket,state
gh api graphql -f query='query($owner:String!, $repo:String!, $pr:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$pr) { reviewThreads(first:100) { nodes { isResolved } } } } }' -f owner=Hiroki-org -f repo=jules-extension -F pr=<PR#>
```

**Output**:
- PR-level summary of pending/failing checks
- Unresolved review-thread count
- Recommended next action

---

## commit-and-push

**Purpose**: Keep commits consistent and traceable.

**Workflow**:

```bash
git add <changed-files>
git commit -m "fix(scope): summary"
git push -u origin <branch>
```

**Success Criteria**:
- Conventional commit style
- Branch is pushed
- PR can be opened or updated immediately
