import os
import json

# Output the tool call format for reply_to_pr_comments
replies = [
    {
        "comment_id": "4403282000",
        "reply": "日本語での対応を求められているため、日本語で返信します。確認いたしました。"
    }
]

print(f"call:reply_to_pr_comments{{\"replies\": {json.dumps(replies)}}}")
