# Sentinel Journal

## 2025-12-11 - [Git Remote URL Logging Leak]
**Vulnerability:** Gitの `remote get-url` の出力をそのままログに出力していたため、URLに埋め込まれたPAT（Personal Access Token）が漏洩するリスクがあった。
**Learning:** `git remote` の出力はユーザーの `.git/config` に依存するため、認証情報が含まれている可能性があると想定すべき。
**Prevention:** 外部コマンドや設定ファイルからの出力をログ記録する際は、必ずサニタイズ（特にURLや認証情報）を行う。

## 2025-05-22 - [Missing API Timeouts]
**Vulnerability:** Default `fetch` calls have no timeout, leading to potential indefinite hanging of the extension background process if the API server is unresponsive.
**Learning:** `fetch` in Node/Browser defaults to no timeout. Always enforce timeouts for external API calls to ensure availability.
**Prevention:** Use a wrapper like `fetchWithTimeout` or `AbortSignal.timeout` for all network requests.


## 2025-12-21 - [Weak HTML Escaping]
**Vulnerability:** `escapeHtml`関数がシングルクォート（'）とダブルクォート（"）をエスケープしていなかったため、属性値などで使用された場合にXSSの潜在的なリスクがあった。
**Learning:** HTMLエスケープ関数を実装する際は、コンテキスト（本文、属性）に関わらず安全に使えるよう、クォートも含めてエスケープするのが望ましい。
**Prevention:** 独自のサニタイズ関数を作成せず、定評のあるライブラリを使用するか、OWASP推奨のエスケープ文字セット（&, <, >, ", '）を網羅する。
