import urllib.request
import json
import os

repo = os.environ.get("GITHUB_REPOSITORY")
pr = os.environ.get("GITHUB_EVENT_NUMBER")
token = os.environ.get("GITHUB_TOKEN")

if repo and pr and token:
    url = f"https://api.github.com/repos/{repo}/pulls/{pr}/reviews"
    req = urllib.request.Request(url, headers={"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"})
    try:
        with urllib.request.urlopen(req) as response:
            reviews = json.loads(response.read().decode('utf-8'))
            for r in reviews:
                print(f"Review by {r.get('user', {}).get('login')}: {r.get('body')}")
    except Exception as e:
        print(f"Error reading PR reviews: {e}")
else:
    print("Missing env vars for github API")
