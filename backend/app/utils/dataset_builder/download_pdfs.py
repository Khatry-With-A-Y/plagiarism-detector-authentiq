import requests
import os
import json

# Use the same robust path calculation as in fetch_papers.py
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))

# Input JSON (created by fetch_papers.py)
json_path = os.path.join(backend_dir, "data", "raw_papers", "cs_papers.json")

# Output directory for PDFs
pdf_dir = os.path.join(backend_dir, "data", "raw_papers")

os.makedirs(pdf_dir, exist_ok=True)

with open(json_path, encoding="utf-8") as f:
    papers = json.load(f)

for p in papers:
    url = p.get("pdf_url")
    if not url:
        continue

    filename = os.path.join(pdf_dir, f"{p['paperId']}.pdf")

    try:
        r = requests.get(url, timeout=30, allow_redirects=True)
        r.raise_for_status()  # raise exception for bad status codes (4xx, 5xx)

        content_type = r.headers.get("Content-Type", "").lower()
        if "pdf" not in content_type:
            print("Skipped (not PDF content-type):", url)
            continue

        if not r.content.startswith(b"%PDF"):
            print("Skipped (does not start with PDF signature):", url)
            continue

        with open(filename, "wb") as f:
            f.write(r.content)

        print("Saved:", filename)

    except requests.exceptions.RequestException as e:
        print("Download failed:", url, str(e))
    except Exception as e:
        print("Error saving file:", filename, str(e))