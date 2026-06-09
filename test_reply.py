import json

replies = [
    {
        "comment_id": "3378103356",
        "reply": "対応しました。`cancelButton` は存在確認してから disabled を設定する guard に変更しました。"
    },
    {
        "comment_id": "3378103357",
        "reply": "対応しました。`cancelButton` が null の場合に TypeError にならないよう、`if (cancelButton)` guard を追加しました。"
    },
    {
        "comment_id": "3378103367",
        "reply": "対応しました。ネイティブフォーム要素では `aria-disabled` の同期をやめ、`disabled` と `:disabled` に寄せました。PR内の palette メモも、`aria-disabled` はフォーカス可能な custom widget 用に限定する内容へ修正しています。"
    }
]

print(json.dumps(replies))
