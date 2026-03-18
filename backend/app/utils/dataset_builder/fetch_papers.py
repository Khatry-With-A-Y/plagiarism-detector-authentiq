import requests
import json
import os
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

API_KEY = "oJ1QzmqNMN2TArRaxaZs54MRYSKjVTAV5PkGmrCY"
headers = {
    "x-api-key": API_KEY
}

url = "https://api.semanticscholar.org/graph/v1/paper/search/bulk"

QUERIES = [
    "machine learning",
    "deep learning",
    "natural language processing",
    "computer vision",
    "data structures",
    "operating systems",
    "computer networks",
    "distributed systems",
    "database management systems",
    "cryptography",
    "software engineering",
    "programming languages",
    "human computer interaction",
    "computer graphics",
    "parallel computing",
    "reinforcement learning",
    "bioinformatics",
    "robotics",
    "information retrieval",
    "quantum computing",
    "web technology",
    "cloud computing",
    "cybersecurity",
    "computer architecture",
    "algorithms",
    "artificial intelligence",
    "data mining",
    "image processing",
    "signal processing",
    "embedded systems",
    "mobile computing",
    "internet of things",
    "blockchain",
    "augmented reality",
    "simulation",
    "formal methods",
    "numerical methods",
    "computational complexity",
    "logic programming",
    "knowledge representation",
]

# domains that don't serve direct PDF downloads — blocked at fetch time
# so they never make it into cs_papers.json
BLOCKED_DOMAINS = [
    "doi.org",
    "mdpi.com",
    "link.springer.com",
    "dl.acm.org",
    "ieeexplore.ieee.org",
    "academic.oup.com",
    "onlinelibrary.wiley.com",
    "www.nature.com",
    "www.sciencedirect.com",
]

def is_blocked(url):
    return any(domain in url for domain in BLOCKED_DOMAINS)

TARGET = 600            # fetch more than needed to reduce top-up reliance
ACTUAL_GOAL = 500       # the real number of papers you want — used for warning/success messages
WORKERS = 7 #3            # number of parallel threads — keep low to avoid API rate limiting
MAX_SERVER_ERRORS = 5   # how many consecutive 500 errors before giving up on a query

papers = []         # final collected papers across all queries
seen = set()        # tracks paperIds already added — prevents duplicates across queries
lock = Lock()       # prevents race conditions when threads write to shared papers/seen

def fetch_query(query, query_target, verbose=True):
    """Fetches up to query_target papers for a single query from the Semantic Scholar API.
    verbose=False suppresses all prints except errors — used during top-up pass."""

    local_papers = []   # papers collected by this query
    local_seen = set()  # dedup within this query before merging into global seen
    collected = 0       # how many valid papers collected so far for this query
    token = None        # pagination token — None means first page
    server_errors = 0   # consecutive 500 error counter for this query

    params = {
        "query": query,
        "fields": "paperId,title,year,openAccessPdf,fieldsOfStudy,authors"
    }

    while collected < query_target:
        if token:
            params["token"] = token  # add pagination token for subsequent pages

        try:
            response = requests.get(url, headers=headers, params=params, timeout=(10, 30))
        except requests.exceptions.RequestException as e:
            if verbose:
                print(f"Request failed for '{query}' - {str(e)}")
            break

        if response.status_code == 429:
            # rate limited — wait longer before retrying
            if verbose:
                print(f"Rate limited on '{query}', waiting 30s before retry...")
            time.sleep(30)
            continue

        if response.status_code == 500:
            # server error — could be temporary, retry up to MAX_SERVER_ERRORS times
            server_errors += 1
            if server_errors >= MAX_SERVER_ERRORS:
                if verbose:
                    print(f"Too many server errors on '{query}' ({server_errors}/{MAX_SERVER_ERRORS}), giving up.")
                break
            if verbose:
                print(f"Server error on '{query}' ({server_errors}/{MAX_SERVER_ERRORS}), waiting 10s before retry...")
            time.sleep(10)
            continue

        if response.status_code != 200:
            # any other unexpected error — stop this query immediately
            if verbose:
                print(f"Error {response.status_code} on query '{query}', stopping.")
            break

        # reset server error counter on a successful response
        server_errors = 0

        data = response.json()

        for paper in data.get("data", []):
            if collected >= query_target:
                break

            # only keep papers tagged as Computer Science
            fields = paper.get("fieldsOfStudy") or []
            if "Computer Science" not in fields:
                continue

            # only keep papers with a valid open access PDF url
            pdf_url = None
            if paper.get("openAccessPdf"):
                pdf_url = paper["openAccessPdf"].get("url")

            if not pdf_url or is_blocked(pdf_url):
                continue

            paper_id = paper.get("paperId")
            if paper_id in local_seen:
                continue

            local_seen.add(paper_id)
            local_papers.append({
                "paperId": paper_id,
                "title": paper.get("title"),
                "year": paper.get("year"),
                "authors": paper.get("authors"),
                "pdf_url": pdf_url,
                "field": query  # which query this paper came from
            })
            collected += 1

        # get next page token — None means no more pages for this query
        token = data.get("token")
        if not token:
            break

        time.sleep(random.uniform(0.5, 1.5))  # polite delay between page requests

    if verbose:
        print(f"Done: '{query}' got {collected}/{query_target}")
    return local_papers

# distribute TARGET evenly across all queries
# if TARGET doesn't divide evenly, first 'remainder' queries get one extra
per_query = TARGET // len(QUERIES)
remainder = TARGET % len(QUERIES)
query_targets = {
    q: per_query + (1 if i < remainder else 0)
    for i, q in enumerate(QUERIES)
}

print(f"Total target: {TARGET} | Actual goal: {ACTUAL_GOAL} | Queries: {len(QUERIES)} | Threads: {WORKERS}\n")
start_time = time.time()

with ThreadPoolExecutor(max_workers=WORKERS) as executor:
    futures = {
        executor.submit(fetch_query, query, query_targets[query]): query
        for query in QUERIES
    }

    for future in as_completed(futures):
        result = future.result()
        with lock:
            # merge each query's results into global papers list, skipping duplicates
            for p in result:
                if p["paperId"] not in seen:
                    seen.add(p["paperId"])
                    papers.append(p)

# ────────────────────────────────────────────────
# Top-up pass — ask user before running
# ────────────────────────────────────────────────
if len(papers) < ACTUAL_GOAL:
    shortfall = ACTUAL_GOAL - len(papers)
    print(f"\nMain run complete. Got {len(papers)}/{ACTUAL_GOAL} (shortfall of {shortfall}).")

    answer = input(f"Run top-up pass to try to fill the gap? (y/n): ").strip().lower()

    if answer == "y":
        print("Running top-up pass...")

        for query in QUERIES:
            if len(papers) >= ACTUAL_GOAL:
                break

            still_needed = ACTUAL_GOAL - len(papers)
            result = fetch_query(query, still_needed, verbose=False)

            added = 0
            for p in result:
                if p["paperId"] not in seen:
                    seen.add(p["paperId"])
                    papers.append(p)
                    added += 1

            # only print if this query actually contributed something
            if added > 0:
                print(f"  Top-up [{len(papers)}/{ACTUAL_GOAL}]: '{query}' +{added}")

        if len(papers) < ACTUAL_GOAL:
            print(f"Top-up exhausted. Could not reach goal, got {len(papers)}/{ACTUAL_GOAL}.")
        else:
            print(f"Top-up successful.")
    else:
        print(f"Skipping top-up. Saving {len(papers)} papers as-is.")

elapsed = time.time() - start_time
print(f"\nFinal count: {len(papers)} in {elapsed:.1f}s")

if len(papers) < ACTUAL_GOAL:
    print(f"Warning: only got {len(papers)}/{ACTUAL_GOAL}. Some queries ran dry.")
else:
    print(f"Successfully collected {len(papers)} papers (goal was {ACTUAL_GOAL}).")

script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))
output_path = os.path.join(backend_dir, "data", "raw_papers", "cs_papers.json")
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(papers, f, indent=2)

print(f"Saved to: {output_path}")