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
git add -A
git commit -m "feat(<scope>): <summary>"
git push -u origin <branch>
gh pr create --base main --head <branch> --title "<title>" --body $'<概要>\n\nCloses #<ISSUE_NUMBER>'
```

## フェーズ3: PR review closure loop

対象 PR ごとに、以下を停止条件まで繰り返す。

1. 状態収集

```bash
gh pr view <PR#> --json number,state,mergeStateStatus,mergeable,reviewDecision,reviews,comments,statusCheckRollup,headRefName,baseRefName
gh api graphql -f query='query($owner:String!, $repo:String!, $pr:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$pr) { reviewThreads(first:100) { nodes { id isResolved isOutdated comments(first:20) { nodes { databaseId author { login } body path line url } } } } } } }' -f owner=Hiroki-org -f repo=jules-extension -F pr=<PR#>
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
gh pr checks <PR#> --watch --interval 10
```

5. ポーリングで再確認

```bash
OWNER="Hiroki-org"
REPO="jules-extension"
PR_NUMBER="<PR#>"

max_iterations=20

for iteration in $(seq 1 "$max_iterations"); do
  unresolved_threads="$(gh api graphql -f query='query($owner:String!, $repo:String!, $number:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviewThreads(first:100) { nodes { isResolved } } } } }' -F owner="$OWNER" -F repo="$REPO" -F number="$PR_NUMBER" --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length')"
  pending_checks="$(gh pr checks "$PR_NUMBER" --json bucket --jq '[.[] | select(.bucket == "pending")] | length')"
  failing_checks="$(gh pr checks "$PR_NUMBER" --json bucket --jq '[.[] | select(.bucket == "fail" or .bucket == "failure" or .bucket == "cancel" or .bucket == "cancelled")] | length')"
  merge_state="$(gh pr view "$PR_NUMBER" --json mergeStateStatus --jq '.mergeStateStatus')"
  mergeable_state="$(gh pr view "$PR_NUMBER" --json mergeable --jq '.mergeable')"

  if [ "$unresolved_threads" -eq 0 ] && [ "$pending_checks" -eq 0 ] && [ "$failing_checks" -eq 0 ] && [ "$merge_state" != "DIRTY" ] && [ "$mergeable_state" = "MERGEABLE" ]; then
    break
  fi

  if [ "$iteration" -eq "$max_iterations" ]; then
    echo "Loop cap reached (${max_iterations} iterations). Human escalation required."
    break
  fi

  sleep 300
done
```

6. 再レビュー依頼

```bash
gh pr comment <PR#> --body "レビュー指摘対応と thread resolve を完了しました。CI/コンフリクト確認済みです。再レビューお願いします。"
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
