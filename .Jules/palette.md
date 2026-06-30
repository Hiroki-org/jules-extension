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

## 2026-06-11 - Dynamic Empty State Announcers
**Learning:** When dynamically inserting empty state indicators (e.g., "Ready to assist" or "Welcome to Jules" placeholder messages) into a chat or feed interface, screen readers might not immediately announce the new content if it is simply appended to the DOM. Adding `aria-live="polite"` and `aria-atomic="true"` directly to the container element ensures the screen reader announces the status change appropriately.
**Action:** Whenever dynamically creating and injecting a completely new 'empty state' container to replace existing content, apply `aria-live="polite"` and `aria-atomic="true"` to the container so that users relying on assistive technology are immediately aware of the UI change.

## 2026-06-30 - コピーボタンの動的なアクセシビリティ対応
**Learning:** コピーボタンのようなインタラクティブ要素の動的なテキスト変更（例：「Copy」から「Copied」への変更）を行う際、対応するARIA属性（aria-label、title）も同時に更新し、スクリーンリーダーが新しい状態をアナウンスできるようにすることが非常に重要です。また、セッションインジケーターやタイピング状態などの動的なテキスト領域にaria-live="polite"とaria-atomic="true"を追加することで、スクリーンリーダーが更新されたテキスト全体を正しく読み上げるようになります。
**Action:** 次回、ボタンやインジケーターに一時的なテキスト変更を実装する際は、テキストと共にaria-labelとtitleを同期して更新し、aria-live領域には必ずaria-atomic="true"を設定すること。
