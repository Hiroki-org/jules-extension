# Sentinel Journal

## 2025-12-11 - [Git Remote URL Logging Leak]
**Vulnerability:** Gitの `remote get-url` の出力をそのままログに出力していたため、URLに埋め込まれたPAT（Personal Access Token）が漏洩するリスクがあった。
**Learning:** `git remote` の出力はユーザーの `.git/config` に依存するため、認証情報が含まれている可能性があると想定すべき。
**Prevention:** 外部コマンドや設定ファイルからの出力をログ記録する際は、必ずサニタイズ（特にURLや認証情報）を行う。
