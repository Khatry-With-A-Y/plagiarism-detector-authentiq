import requests
import json
import time

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

with open("cs_papers.json", "w", encoding="utf-8") as f:
    json.dump(papers, f, indent=2)