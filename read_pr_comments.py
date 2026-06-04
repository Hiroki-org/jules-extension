import os
import json

comments_path = os.environ.get('PR_COMMENTS_PATH', '/tmp/pr_comments.json')
if os.path.exists(comments_path):
    with open(comments_path, 'r') as f:
        print(f.read())
else:
    print("No PR comments file found at", comments_path)
