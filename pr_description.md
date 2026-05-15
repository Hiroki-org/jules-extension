セッション一覧の複数選択と一括アクション対応（Delete Session） #574

### 実装内容

💡 What:
- TreeView (`julesSessionsView`) に `canSelectMany: true` を設定し、セッションの複数選択を可能にしました。
- `jules-extension.deleteSession` コマンドをリファクタリングし、引数で渡される複数選択されたアイテム群（`selectedItems`）を受け取れるようにしました。
- 複数のセッションを一括削除できるように `deleteSingleSession` および `resolveSelectedSessionItems` ユーティリティを追加し、確認ダイアログと進捗UIを備えた一括削除処理を実装しました。
- タイトルアクション（`view/title`）に一括削除用の `jules-extension.deleteSession` メニューを追加しました。

🎯 Why:
- セッションの一覧管理を行う際に、一つずつコンテキストメニューから削除する手間を省き、ユーザーが不要なセッションを一括で素早くクリーンアップできるようにするため。
- 将来的な一括アクション（Open, Checkout等）を見据え、複数選択されたアイテムを一意に解決するための共通基盤を作成するため。

📸 Before/After:
- Before: TreeViewでの選択は単一のみで、Delete Sessionを実行しても対象は常に1件で逐一モーダル確認を求められた。
- After: ShiftやCtrl/Cmdキーを用いて複数のセッションを選択可能になり、右クリックまたはタイトルメニューから一括削除が可能。複数件の場合「Delete X sessions?」とまとめて確認され、進捗通知とともに逐次削除が行われる。

♿ Accessibility:
- モーダル確認（`modal: true`）を用いることで、一括という破壊的操作に対してキーボードフォーカスが確認アクションへ明示的に移動し、スクリーンリーダーでも操作の深刻さと対象件数が正しく読み上げられます。
