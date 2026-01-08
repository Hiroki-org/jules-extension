## 2025-12-11 - Webview Accessibility
**Learning:** This extension constructs Webview HTML manually in `composer.ts`. The message textarea lacked a label, relying on `placeholder`. This is a common pattern here that hurts screen reader accessibility.
**Action:** When working on Webviews in this repo, always check `composer.ts` or similar HTML generators for missing `aria-label` or `<label>` tags on form inputs.

## 2025-12-12 - Webview Focus Styles
**Learning:** VS Code Webviews do not automatically apply focus styles to buttons. They require manual CSS using `--vscode-focusBorder`.
**Action:** Always add `button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }` to Webview CSS.

## 2025-12-13 - Checkbox Theming in Webviews
**Learning:** Native checkboxes in Webviews lack VS Code theme integration (accent color, focus styles).
**Action:** Apply `accent-color: var(--vscode-button-background)` and custom `:focus-visible` styles to match the VS Code design system.

## 2025-12-14 - TreeItem Tooltips
**Learning:** Use `vscode.MarkdownString` for TreeItem tooltips to provide rich, structured information (bold text, icons, line breaks) instead of plain text strings. This greatly improves information density and readability for complex items.
**Action:** When creating TreeItems with multiple data points, use `MarkdownString` for the tooltip.

## 2025-12-15 - Tree View Empty States
**Learning:** Returning an empty array in `getChildren` works perfectly with `viewsWelcome` in `package.json` to provide rich, actionable empty states, replacing manual "No items found" tree items.
**Action:** Always check `package.json` for `viewsWelcome` when handling empty states in TreeDataProviders, instead of creating dummy TreeItems.

## 2025-12-16 - Webview Input Validation
**Learning:** Preventing empty submissions in Webviews significantly improves UX by avoiding error cycles. Disabling the submit button and handling keyboard shortcuts (Cmd+Enter) ensures a consistent experience.
**Action:** When creating forms in Webviews, always implement client-side validation to disable submit actions when inputs are invalid.
## 2025-12-30 - Added Loading State to Composer Webview
**Learning:** Webviews in VS Code need manual loading state management. Simply posting a message does not give immediate feedback, and the webview might not close instantly if there is extension host latency. Disabling inputs and changing button text immediately upon click provides a much better user experience and prevents duplicate submissions.
**Action:** For all future Webview forms, always implement a disable-and-update-text pattern in the submit handler before `vscode.postMessage`.

## 2026-01-06 - Secondary Button Hover
**Learning:** VS Code's secondary buttons (like Cancel) require a manual hover state using `var(--vscode-button-secondaryHoverBackground)` to match the native look and feel. They don't get this automatically in Webviews.
**Action:** Always add `button:not(.primary):hover { background: var(--vscode-button-secondaryHoverBackground); }` to Webview CSS for non-primary buttons.
