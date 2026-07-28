## 2026-07-28 - Update Disabled State Labels
**Learning:** 非同期処理中にボタンを無効化する際、単に disabled 属性を付与するだけでは、スクリーンリーダーユーザーなどに無効化の理由が伝わらない。
**Action:** 送信中のキャンセルボタンのように、動的に要素を無効化する場合は、常に title と aria-label を更新し、理由（例: 'Cannot cancel while sending'）を明示すること。
