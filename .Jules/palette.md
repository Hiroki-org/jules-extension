## 2025-12-11 - Webview Accessibility
**Learning:** This extension constructs Webview HTML manually in `composer.ts`. The message textarea lacked a label, relying on `placeholder`. This is a common pattern here that hurts screen reader accessibility.
**Action:** When working on Webviews in this repo, always check `composer.ts` or similar HTML generators for missing `aria-label` or `<label>` tags on form inputs.
