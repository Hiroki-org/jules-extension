## 2024-05-14 - Empty state
**Learning:** Adding empty states helps users.
**Action:** Always add them.
## 2026-06-20 - 動的ボタンテキストのアクセシビリティ
**Learning:** コピーボタンのようにテキストが動的に変更される要素は、明示的な属性がないとスクリーンリーダーで状態変化が読み上げられない。
**Action:** テキストが動的に変更されるインタラクティブな要素には、常に `aria-live="polite"` と `aria-atomic="true"` を追加する。
