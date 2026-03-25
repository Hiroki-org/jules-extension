# Issue → PR → Review Loop Runbook (jules-extension)

このドキュメントは、`Hiroki-org/jules-extension` で open issue を実装 PR へ落とし込み、review 解決・CI 完了・コンフリクト確認まで回す実運用手順です。

## 目的

- open issue を PR で着実に解決する
- review conversation を未対応で残さない
- CI と mergeability を確認して再レビュー依頼まで完了する

## 前提

- `gh` CLI が利用可能
- リポジトリ: `Hiroki-org/jules-extension`
- 基本検証:
  - `pnpm run check-types`
  - `pnpm run lint`
  - `pnpm run test:unit`

## フェーズ1: open issue 棚卸し

```bash
gh issue list --state open --limit 100
gh issue view <ISSUE_NUMBER> --comments
```

issue ごとに「この PR で完了とみなす条件」を先に明文化してから着手する。

## フェーズ2: issue ごとに実装 PR を作成

```bash
git fetch origin
git switch -c feat/issue-<number>-<topic> origin/main
```

実装後:

```bash
pnpm run check-types && pnpm run lint && pnpm run test:unit
git status --short
git add <changed-files>
git commit -m "feat(<scope>): <summary>"
git push -u origin <branch>
gh pr create --base main --head <branch> --title "<title>" --body $'<概要>\n\nCloses #<ISSUE_NUMBER>'
```

## フェーズ3: PR review closure loop

対象 PR ごとに、以下を停止条件まで繰り返す。

1. 状態収集

```bash
gh pr view <PR#> --json number,state,mergeStateStatus,mergeable,reviewDecision,reviews,comments,statusCheckRollup,headRefName,baseRefName
# Repeat with `-f after="<endCursor>"` while `hasNextPage` is true.
gh api graphql -f query='query($owner:String!, $repo:String!, $pr:Int!, $after:String) { repository(owner:$owner, name:$repo) { pullRequest(number:$pr) { reviewThreads(first:100, after:$after) { nodes { id isResolved isOutdated comments(first:20) { nodes { databaseId author { login } body path line url } } } pageInfo { hasNextPage endCursor } } } } }' -f owner=Hiroki-org -f repo=jules-extension -F pr=<PR#>
```

2. 各スレッドを判定
- `ADDRESS`: 修正実装 → commit/push → thread 返信
- `IGNORE_WITH_REASON`: 根拠付きで thread 返信

3. 返信後に resolve

```bash
gh api graphql -f query='mutation($threadId:ID!) { resolveReviewThread(input:{threadId:$threadId}) { thread { id isResolved } } }' -f threadId=<THREAD_ID>
```

4. CI とコンフリクトを監視

```bash
if command -v timeout >/dev/null 2>&1; then
  timeout 300 gh pr checks <PR#> --watch --interval 10 || true
fi
```

5. ポーリングで再確認

```bash
OWNER="Hiroki-org"
REPO="jules-extension"
PR_NUMBER="<PR#>"

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
cap_reached=0

for iteration in $(seq 1 "$max_iterations"); do
  check_scope="--required"
  # `gh pr checks` returns exit code 8 while checks are pending.
  # Do not use exit status alone to decide fallback scope.
  required_probe="$(gh pr checks "$PR_NUMBER" --required --json bucket 2>&1 || true)"
  if echo "$required_probe" | grep -qi "no required checks reported"; then
    check_scope=""
  elif echo "$required_probe" | jq -e . >/dev/null 2>&1; then
    : # required checks are available; keep --required scope
  else
    check_scope=""
  fi

  unresolved_threads="$(count_unresolved_threads "$OWNER" "$REPO" "$PR_NUMBER")"
  pending_checks="$(gh pr checks "$PR_NUMBER" $check_scope --json bucket --jq '[.[] | select(.bucket == "pending")] | length')"
  failing_checks="$(gh pr checks "$PR_NUMBER" $check_scope --json bucket --jq '[.[] | select(.bucket == "fail" or .bucket == "failure" or .bucket == "cancel" or .bucket == "cancelled")] | length')"
  merge_state="$(gh pr view "$PR_NUMBER" --json mergeStateStatus --jq '.mergeStateStatus')"
  mergeable_state="$(gh pr view "$PR_NUMBER" --json mergeable --jq '.mergeable')"

  if [ "$unresolved_threads" -eq 0 ] && [ "$pending_checks" -eq 0 ] && [ "$failing_checks" -eq 0 ] && [ "$merge_state" != "DIRTY" ] && [ "$mergeable_state" = "MERGEABLE" ]; then
    break
  fi

  if [ "$iteration" -eq "$max_iterations" ]; then
    echo "Loop cap reached (${max_iterations} iterations). Human escalation required."
    cap_reached=1
    break
  fi

  sleep 300
done

if [ "$cap_reached" -ne 1 ] && { [ "$unresolved_threads" -ne 0 ] || [ "$pending_checks" -ne 0 ] || [ "$failing_checks" -ne 0 ] || [ "$merge_state" = "DIRTY" ] || [ "$mergeable_state" != "MERGEABLE" ]; }; then
  echo "停止条件未達。再レビュー依頼は行わず、ブロッカーを報告してエスカレーションする。"
fi
```

6. 再レビュー依頼

```bash
if [ "$unresolved_threads" -eq 0 ] && [ "$pending_checks" -eq 0 ] && [ "$failing_checks" -eq 0 ] && [ "$merge_state" != "DIRTY" ] && [ "$mergeable_state" = "MERGEABLE" ]; then
  gh pr comment <PR#> --body "レビュー指摘対応と thread resolve を完了しました。CI/コンフリクト確認済みです。再レビューお願いします。"
fi
```

## 停止条件

- unresolved threads = 0
- pending checks = 0
- failing/cancelled checks = 0
- `mergeStateStatus != DIRTY` and `mergeable == MERGEABLE`

## エスカレーション

以下の場合は人間判断へエスカレーション:

- 要件と相反するレビュー要求
- 大規模リファクタが必要な修正
- 権限不足で thread を resolve できない
