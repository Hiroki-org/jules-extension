import os
import json
import urllib.request
import urllib.parse

def run():
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("No GITHUB_TOKEN")
        return

    print("Cannot push code manually, the tool `submit` must be used or we wait.")
run()
