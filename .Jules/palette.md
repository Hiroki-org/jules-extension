## 2025-05-11 - ARIA属性とコンテンツ変更の同期
**Learning:** コピーボタンのようなインタラクティブ要素の動的なテキスト変更（例：「Copy」から「Copied」への変更）を行う際、対応するARIA属性（`aria-label`、`title`）も同時に更新し、スクリーンリーダーが新しい状態をアナウンスできるようにすることが非常に重要です。また、セッションインジケーターやタイピング状態などの動的なテキスト領域に`aria-live="polite"`と`aria-atomic="true"`を追加することで、スクリーンリーダーが更新されたテキスト全体を正しく読み上げるようになります。
**Action:** 次回、ボタンやインジケーターに一時的なテキスト変更を実装する際は、テキストと共に`aria-label`と`title`を同期して更新し、`aria-live`領域には必ず`aria-atomic="true"`を設定すること。

## 2025-05-11 - ARIA属性とコンテンツ変更の同期
**Learning:** コピーボタンのようなインタラクティブ要素の動的なテキスト変更（例：「Copy」から「Copied」への変更）を行う際、対応するARIA属性（`aria-label`、`title`）も同時に更新し、スクリーンリーダーが新しい状態をアナウンスできるようにすることが非常に重要です。また、セッションインジケーターやタイピング状態などの動的なテキスト領域に`aria-live="polite"`と`aria-atomic="true"`を追加することで、スクリーンリーダーが更新されたテキスト全体を正しく読み上げるようになります。
**Action:** 次回、ボタンやインジケーターに一時的なテキスト変更を実装する際は、テキストと共に`aria-label`と`title`を同期して更新し、`aria-live`領域には必ず`aria-atomic="true"`を設定すること。

## 2025-05-11 - Dynamic ARIA Labeling for Context-Aware Inputs
**Learning:** When using context-aware placeholders (like dynamically changing the placeholder from "Select a session to start typing" to "Enter message (Ctrl/Cmd+Enter to send)"), it is crucial to synchronize these changes with ARIA attributes (`aria-label` and `title`) to ensure screen readers provide accurate, up-to-date context, preventing users from becoming disoriented by outdated or mismatched labels.
**Action:** Next time an input element's visual cue (like a placeholder) is dynamically updated based on state, immediately map that updated string to the element's `aria-label` and `title` properties within the same DOM update cycle.

## 2024-05-22 - Session Label Title Synchronization
**Learning:** When text truncation is applied via CSS (`text-overflow: ellipsis`) to dynamically populated UI elements like the session label, it is necessary to dynamically sync the `title` attribute to match the `textContent`. This ensures that screen reader users and those hovering over the truncated text can access the full context.
**Action:** Next time an element's text dynamically updates and may be truncated visually, immediately map the updated text to the element's `title` property within the same DOM update cycle.