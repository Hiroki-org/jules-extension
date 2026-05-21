## 2025-05-11 - ARIA属性とコンテンツ変更の同期
**Learning:** コピーボタンのようなインタラクティブ要素の動的なテキスト変更（例：「Copy」から「Copied」への変更）を行う際、対応するARIA属性（`aria-label`、`title`）も同時に更新し、スクリーンリーダーが新しい状態をアナウンスできるようにすることが非常に重要です。また、セッションインジケーターやタイピング状態などの動的なテキスト領域に`aria-live="polite"`と`aria-atomic="true"`を追加することで、スクリーンリーダーが更新されたテキスト全体を正しく読み上げるようになります。
**Action:** 次回、ボタンやインジケーターに一時的なテキスト変更を実装する際は、テキストと共に`aria-label`と`title`を同期して更新し、`aria-live`領域には必ず`aria-atomic="true"`を設定すること。

## 2025-05-11 - ARIA属性とコンテンツ変更の同期
**Learning:** コピーボタンのようなインタラクティブ要素の動的なテキスト変更（例：「Copy」から「Copied」への変更）を行う際、対応するARIA属性（`aria-label`、`title`）も同時に更新し、スクリーンリーダーが新しい状態をアナウンスできるようにすることが非常に重要です。また、セッションインジケーターやタイピング状態などの動的なテキスト領域に`aria-live="polite"`と`aria-atomic="true"`を追加することで、スクリーンリーダーが更新されたテキスト全体を正しく読み上げるようになります。
**Action:** 次回、ボタンやインジケーターに一時的なテキスト変更を実装する際は、テキストと共に`aria-label`と`title`を同期して更新し、`aria-live`領域には必ず`aria-atomic="true"`を設定すること。

## 2025-05-11 - Dynamic ARIA Labeling for Context-Aware Inputs
**Learning:** When using context-aware placeholders (like dynamically changing the placeholder from "Select a session to start typing" to "Enter message (Ctrl/Cmd+Enter to send)"), it is crucial to synchronize these changes with ARIA attributes (`aria-label` and `title`) to ensure screen readers provide accurate, up-to-date context, preventing users from becoming disoriented by outdated or mismatched labels.
**Action:** Next time an input element's visual cue (like a placeholder) is dynamically updated based on state, immediately map that updated string to the element's `aria-label` and `title` properties within the same DOM update cycle.
## 2025-05-19 - ARIA Status Announcements for Empty States
**Learning:** When dynamic UI areas transition to or from an empty state (e.g., from "Welcome" to "Ready to assist" when selecting a session), screen reader users are often left unaware of the change unless the update is explicitly announced. Relying on default semantic markup isn't enough because the outer container doesn't announce content insertions implicitly.
**Action:** Next time an `empty-state` or similar "no data" placeholder is dynamically rendered or swapped, update a persistent dedicated status element with `role="status"`, `aria-live="polite"`, and `aria-atomic="true"` so the announcement is reliable without turning the message list itself into a live region.

## 2025-05-20 - sessionLabel Tooltips and ARIA-labels
**Learning:** When applying CSS text truncation (e.g., `text-overflow: ellipsis`) to dynamically populated UI elements like the `sessionLabel`, the full text is hidden from the user. Even if screen readers can read the full text via textContent, sighted users cannot view the full label.
**Action:** Next time an element is styled with `text-overflow: ellipsis`, ensure a `title` attribute matching the `textContent` is explicitly set so users can read the full content on hover. In addition, setting `aria-label` to match ensures consistency across both visual and auditory interfaces.
