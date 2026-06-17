## 2025-05-11 - ARIA属性とコンテンツ変更の同期
**Learning:** コピーボタンのようなインタラクティブ要素の動的なテキスト変更（例：「Copy」から「Copied」への変更）を行う際、対応するARIA属性（`aria-label`、`title`）も同時に更新し、スクリーンリーダーが新しい状態をアナウンスできるようにすることが非常に重要です。また、セッションインジケーターやタイピング状態などの動的なテキスト領域に`aria-live="polite"`と`aria-atomic="true"`を追加することで、スクリーンリーダーが更新されたテキスト全体を正しく読み上げるようになります。
**Action:** 次回、ボタンやインジケーターに一時的なテキスト変更を実装する際は、テキストと共に`aria-label`と`title`を同期して更新し、`aria-live`領域には必ず`aria-atomic="true"`を設定すること。

## 2025-05-11 - ARIA属性とコンテンツ変更の同期
**Learning:** コピーボタンのようなインタラクティブ要素の動的なテキスト変更（例：「Copy」から「Copied」への変更）を行う際、対応するARIA属性（`aria-label`、`title`）も同時に更新し、スクリーンリーダーが新しい状態をアナウンスできるようにすることが非常に重要です。また、セッションインジケーターやタイピング状態などの動的なテキスト領域に`aria-live="polite"`と`aria-atomic="true"`を追加することで、スクリーンリーダーが更新されたテキスト全体を正しく読み上げるようになります。
**Action:** 次回、ボタンやインジケーターに一時的なテキスト変更を実装する際は、テキストと共に`aria-label`と`title`を同期して更新し、`aria-live`領域には必ず`aria-atomic="true"`を設定すること。

## 2025-05-11 - Dynamic ARIA Labeling for Context-Aware Inputs
**Learning:** When using context-aware placeholders (like dynamically changing the placeholder from "Select a session to start typing" to "Enter message (Ctrl/Cmd+Enter to send)"), it is crucial to synchronize these changes with ARIA attributes (`aria-label` and `title`) to ensure screen readers provide accurate, up-to-date context, preventing users from becoming disoriented by outdated or mismatched labels.
**Action:** Next time an input element's visual cue (like a placeholder) is dynamically updated based on state, immediately map that updated string to the element's `aria-label` and `title` properties within the same DOM update cycle.

## 2026-05-26 - Title Tooltip Support for Truncated Text
**Learning:** When applying CSS `text-overflow: ellipsis` to truncate long dynamically generated content (like a session ID), it is necessary to provide an accessible way for users to view the complete text. Mirroring the `textContent` into the `title` attribute creates a native browser tooltip, enabling hover-based discovery of the full content without requiring custom UI components.
**Action:** Whenever using `text-overflow: ellipsis` to clip text in the DOM, synchronously update the element's `title` attribute to match the full `textContent`.
## 2026-06-06 - Prefer Native Disabled for Form Controls
**Learning:** Native form controls such as `<button>`, `<textarea>`, and `<input>` already expose their disabled state through the `disabled` property. Adding `aria-disabled` to the same disabled controls is redundant and can imply focus behavior that does not match native disabled elements.
**Action:** Use `disabled` and `:disabled` for native form controls. Reserve `aria-disabled` for custom widgets that must remain focusable while unavailable.

## 2026-06-09 - 動的な空状態要素に対するスクリーンリーダー対応
**Learning:** JavaScriptを使用して動的に生成される「空の状態（empty state）」コンテナ（ウェルカムメッセージやプレースホルダーなど）をDOMに挿入する際、要素に`aria-live="polite"`および`aria-atomic="true"`属性を付与することで、スクリーンリーダーが状態の変更を即座にかつ正確にユーザーに通知するようになります。
**Action:** 次回、動的な空状態コンテナをUIに挿入する実装を行う場合は、初期化時に`aria-live="polite"`と`aria-atomic="true"`を設定することを必須とすること。
