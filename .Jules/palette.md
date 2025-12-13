## 2025-12-11 - Webview Accessibility
**Learning:** This extension constructs Webview HTML manually in `composer.ts`. The message textarea lacked a label, relying on `placeholder`. This is a common pattern here that hurts screen reader accessibility.
**Action:** When working on Webviews in this repo, always check `composer.ts` or similar HTML generators for missing `aria-label` or `<label>` tags on form inputs.

## 2025-12-12 - Webview Focus Styles
**Learning:** VS Code Webviews do not automatically apply focus styles to buttons. They require manual CSS using `--vscode-focusBorder`.
**Action:** Always add `button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }` to Webview CSS.

## 2025-12-13 - Checkbox Theming in Webviews
**Learning:** Native checkboxes in Webviews lack VS Code theme integration (accent color, focus styles).
**Action:** Apply `accent-color: var(--vscode-button-background)` and custom `:focus-visible` styles to match the VS Code design system.
