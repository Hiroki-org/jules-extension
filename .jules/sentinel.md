## 2024-05-24 - Add timeout to execFile to prevent DoS
**Vulnerability:** childProcess.execFile does not have a timeout, which can cause the extension host to hang indefinitely if the git process stalls.
**Learning:** External processes should always have a timeout to prevent DoS.
**Prevention:** Always add a timeout option when using childProcess.execFile or similar functions.

## 2024-05-13 - [DOMPurify MathML Tags Disable]
**Vulnerability:** Unnecessary MathML parsing in DOMPurify could widen the attack surface for Cross-Site Scripting (XSS), but using `USE_PROFILES` incorrectly strips default HTML tags.
**Learning:** `USE_PROFILES` resets `ALLOWED_TAGS`. If you provide an invalid key or do not include standard profiles like `html`, DOMPurify removes safe HTML tags like `<p>` and `<a>`, causing UI breakage.

## 2026-05-17 - Composerの送信ボタンにおける潜在的なXSS脆弱性の修正
**Vulnerability:** 送信ボタンの `innerHTML` への代入によるXSSの潜在的リスク。
**Learning:** `innerHTML` にハードコードされたHTML文字列を追加すると、サニタイズチェックが回避され、将来的にユーザー入力の影響を受ける状態が文字列に混入した場合に、VS Code Webview 内でのXSS実行につながる可能性があります。
**Prevention:** UI要素を安全に更新するために、`.textContent`、`document.createElement()`、および `.appendChild()` などのDOM操作メソッドを使用してください。
