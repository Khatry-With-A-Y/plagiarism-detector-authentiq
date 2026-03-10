import requests
import json
import os

API_KEY = "oJ1QzmqNMN2TArRaxaZs54MRYSKjVTAV5PkGmrCY"

headers = {
    "x-api-key": API_KEY
}

url = "https://api.semanticscholar.org/graph/v1/paper/search"

params = {
    "query": "algorithm",
    "limit": 100,
    "fields": "paperId,title,year,openAccessPdf,fieldsOfStudy"
}

response = requests.get(url, headers=headers, params=params)

if response.status_code != 200:
    print("Error:", response.status_code, response.text)
    exit(1)

data = response.json()

papers = []

for paper in data.get("data", []):
    fields = paper.get("fieldsOfStudy") or []
    if "Computer Science" not in fields:
        continue
    
    pdf_url = None
    if paper.get("openAccessPdf"):
        pdf_url = paper["openAccessPdf"].get("url")
    
    papers.append({
        "paperId": paper.get("paperId"),
        "title": paper.get("title"),
        "year": paper.get("year"),
        "pdf_url": pdf_url
    })

print("Collected:", len(papers))

script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))
output_path = os.path.join(backend_dir, "data", "raw_papers", "cs_papers.json")

os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(papers, f, indent=2)

print(f"Saved to: {output_path}")