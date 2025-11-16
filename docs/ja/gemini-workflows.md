# Gemini ワークフローの再利用について

このドキュメントでは、リポジトリにある Gemini に関する GitHub Actions ワークフローの再利用方法と注意点を説明します。

## どのワークフローが再利用可能か

- `gemini-invoke.yml`（workflow_call） — 再利用可能
- `gemini-review.yml`（workflow_call） — 再利用可能
- `gemini-triage.yml`（workflow_call） — 再利用可能
- `gemini-scheduled-triage.yml`（on: schedule） — スケジュール専用で workflow_call ではない（そのままでは再利用できない）

## 再利用時の基本ルール

- 再利用するワークフローは `workflow_call` を使っています。別リポジトリや別ワークフローから呼び出すには `uses:` を使って呼び出します。
- 秘密情報（`GEMINI_API_KEY` や `GOOGLE_API_KEY` など）は呼び出し元のリポジトリに用意しておく必要があります。呼び出し元が fork からの PR で実行される場合、セキュリティポリシーでリポジトリの secrets は渡されません。
- `gemini-dispatch.yml` は `uses: "./.github/workflows/gemini-*.yml"`（同一リポジトリ内での呼び出し）で `secrets: inherit` を使っています。外部から呼び出す場合も secrets を明示的に渡してください。

## 使い方（例）

別リポジトリから `gemini-review.yml` を呼び出す例:

```yaml
jobs:
  call_gemini_review:
    uses: "is0692vs/jules-extension/.github/workflows/gemini-review.yml@main"
    with:
      additional_context: "この PR の差分を見てコードレビューしてください。"
      language: "ja" # 省略時はワークフロー側で 'ja' がデフォルト
    secrets:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
    permissions:
      contents: "read"
      id-token: "write"
      issues: "write"
      pull-requests: "write"
```

### Invoke の呼び出し例

別リポジトリから `gemini-invoke.yml` を呼び出す例（手動/コメント系の Invocation を外部から模倣する用途など）:

```yaml
jobs:
  call_gemini_invoke:
    uses: "is0692vs/jules-extension/.github/workflows/gemini-invoke.yml@main"
    with:
      additional_context: "リポジトリの README を要約してください。"
      language: "ja"
    secrets:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
    permissions:
      contents: "read"
```

### Triage の呼び出し例

別リポジトリから `gemini-triage.yml` を呼び出す例（一括ラベリングなど）:

```yaml
jobs:
  call_gemini_triage:
    uses: "is0692vs/jules-extension/.github/workflows/gemini-triage.yml@main"
    with:
      additional_context: "未ラベルの課題を triage して下さい。"
      language: "ja"
    secrets:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
    permissions:
      contents: "read"
      issues: "write"
```

## 制約・注意点

- 外部リポジトリから呼ぶ場合、呼び出し元で secrets が設定されている必要があります。fork の PR では secrets は渡されません。安全に動かすためには、呼び出し元で必要な secrets を設定するか、内部アクション（GitHub App 等）で代替する運用が必要です。
- `gemini-scheduled-triage.yml` は `on: schedule` で動くため、他リポジトリから使いまわすには `workflow_call` スタイルにリファクタすることを検討してください。スケジュール自体は呼び出し専用ワークフローから別途 `workflow_dispatch` で起動できます。

  - `gemini-scheduled-triage.yml` を再利用しやすくするには、スケジューラ本体（`on: schedule`）から triage の「実行本体」部分を切り出して `workflow_call` を実装し、スケジューラはその `workflow_call` を `uses` で呼ぶ構成にすると、外部からの呼び出しと内部のスケジュールの両方に対応できます。

  - 例: `gemini-scheduled-triage.yml` は `scheduler.yml` として `workflow_dispatch` / `schedule` を管理し、`gemini-triage.yml`（workflow_call）を呼び出す方針にします。

  ### スケジューラ分離の例

  スケジュール専用の `scheduler.yml` を作成し、実際の分析は `gemini-triage.yml`（workflow_call）に委譲する例です。これにより、外部リポジトリから triage を呼び出しやすくなります。

  `/.github/workflows/scheduler.yml`:

  ```yaml
  name: Scheduled Triage Wrapper
  on:
    schedule:
      - cron: "0 * * * *"
    workflow_dispatch:

  jobs:
    trigger_triage:
      uses: "is0692vs/jules-extension/.github/workflows/gemini-triage.yml@main"
      with:
        additional_context: "定期 triage を実行します。"
        language: "ja"
      secrets:
        GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
      permissions:
        contents: "read"
        issues: "write"
  ```

  これにより、`gemini-triage.yml` を `workflow_call` として再利用でき、`scheduler.yml` はスケジュール専用の呼び出しラッパーになります。

## プロンプトの言語について

- セキュリティの観点から、プロンプトを動的に変える場合でも、`language` 入力（`inputs.language`）を追加してあり、デフォルトは `ja`（日本語）にしています。さらに、プロンプトの最初に「出力は必ず日本語で行ってください。」を明示的に追加しています。
- そのため、プロンプトでの出力はデフォルト（かつ推奨）で日本語になります。

- `gemini-dispatch.yml` から呼ばれる場合、`language: 'ja'` を `with:` に渡すように既に設定しており、内部呼び出しでも日本語の応答が安定するようにしています。

---

必要なら、`gemini-scheduled-triage.yml` を `workflow_call` 化し、スケジューラと呼び出しを分割するリファクタ案を実装できます。どのリファクタを望みますか？
