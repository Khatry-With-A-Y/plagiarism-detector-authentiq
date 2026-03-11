import requests
import os
import json
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# Robust path calculation
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))

json_path = os.path.join(backend_dir, "data", "raw_papers", "cs_papers.json")
pdf_dir = os.path.join(backend_dir, "data", "raw_papers")

os.makedirs(pdf_dir, exist_ok=True)

WORKERS = 3             # number of parallel download threads
MIN_FILE_SIZE = 50000   # 50KB minimum — anything smaller is likely corrupt or incomplete

# Multiple User-Agents to rotate
user_agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
]

# browser-like headers — more convincing to institutional repositories
headers_base = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.google.com/",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}

# ────────────────────────────────────────────────
# Quick stats at start — also clean up any leftover small files
# ────────────────────────────────────────────────
with open(json_path, encoding="utf-8") as f:
    papers = json.load(f)

total_papers = len(papers)

already_downloaded = set()
for file in os.listdir(pdf_dir):
    if file.lower().endswith(".pdf"):
        filepath = os.path.join(pdf_dir, file)
        if os.path.getsize(filepath) >= MIN_FILE_SIZE:
            already_downloaded.add(os.path.splitext(file)[0])
        else:
            os.remove(filepath)
            print(f"Removed incomplete file: {file}")

# build list of only papers that still need downloading
pending_papers = [
    p for p in papers
    if p.get("pdf_url") and p.get("paperId") not in already_downloaded
]

print(f"\n=== Download Stats ===")
print(f"Total papers in cs_papers.json: {total_papers}")
print(f"Already downloaded PDFs:         {len(already_downloaded)}")
print(f"Remaining to download:           {len(pending_papers)}")
print(f"Parallel workers:                {WORKERS}")
if pending_papers:
    est_time_min = round(len(pending_papers) * 6 / 60 / WORKERS, 1)
    est_time_max = round(len(pending_papers) * 12 / 60 / WORKERS, 1)
    print(f"Rough time estimate:             {est_time_min} - {est_time_max} minutes")
print("=====================\n")

if not pending_papers:
    print("All papers already downloaded. Nothing to do.")
    exit(0)

# ────────────────────────────────────────────────
# Shared state
# ────────────────────────────────────────────────
lock = Lock()
failed_urls = []
success_count = 0
processed_count = 0
total_pending = len(pending_papers)
start_time = time.time()

def download_paper(p):
    """Downloads a single paper PDF and returns status and message."""
    url = p.get("pdf_url")
    filename = os.path.join(pdf_dir, f"{p['paperId']}.pdf")

    headers = headers_base.copy()
    headers["User-Agent"] = random.choice(user_agents)

    retries = 3

    for attempt in range(retries):
        try:
            r = requests.get(
                url,
                headers=headers,
                timeout=(10, 60),
                allow_redirects=True,
                stream=True
            )
            r.raise_for_status()

            content_type = r.headers.get("Content-Type", "").lower()
            if "pdf" not in content_type and "octet-stream" not in content_type:
                if attempt < retries - 1:
                    time.sleep(3)
                    continue
                return "skipped", f"Not PDF content-type: {url}"

            # stream entire file to disk first, validate after
            with open(filename, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            file_size = os.path.getsize(filename)

            # check file size first — too small means incomplete/error page
            if file_size < MIN_FILE_SIZE:
                os.remove(filename)
                if attempt < retries - 1:
                    time.sleep(5)
                    continue
                return "skipped", f"File too small ({file_size} bytes): {url}"

            # check PDF signature on the saved file
            with open(filename, "rb") as f:
                header = f.read(4)
            if header != b"%PDF":
                os.remove(filename)
                if attempt < retries - 1:
                    time.sleep(3)
                    continue
                return "skipped", f"No PDF signature: {url}"

            field = p.get("field", "unknown")
            title = p.get("title", "Unknown Title")
            short_title = title[:50] + "..." if len(title) > 50 else title
            return "success", f"[{field}]: {short_title}"

        except requests.exceptions.ConnectTimeout:
            if attempt < retries - 1:
                time.sleep(10)
            else:
                return "failed", url

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response else None
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
            else:
                msg = "403 Forbidden" if status == 403 else f"HTTP {status}"
                return "failed", f"{msg}: {url}"

        except requests.exceptions.RequestException:
            if attempt < retries - 1:
                time.sleep(5)
            else:
                return "failed", url

        except Exception:
            return "failed", url

    return "failed", url

# ────────────────────────────────────────────────
# Parallel download loop
# ────────────────────────────────────────────────
with ThreadPoolExecutor(max_workers=WORKERS) as executor:
    futures = {executor.submit(download_paper, p): p for p in pending_papers}

    for future in as_completed(futures):
        status, message = future.result()

        with lock:
            processed_count += 1

            if status == "success":
                success_count += 1
                print(f"Saved {message}")
            elif status == "skipped":
                print(f"Skipped ({message})")
            else:
                failed_urls.append(message)

            if processed_count % 5 == 0 or processed_count == total_pending:
                percent = (processed_count / total_pending) * 100
                elapsed = time.time() - start_time
                eta_sec = (elapsed / processed_count) * (total_pending - processed_count)
                print(f"Progress: {processed_count}/{total_pending} ({percent:.1f}%) | "
                      f"Elapsed: {elapsed/60:.1f} min | "
                      f"ETA: ~{eta_sec/60:.1f} min | "
                      f"Success: {success_count}")

print("\nDownload run complete.")
print(f"Successfully downloaded: {success_count}/{total_pending}")
if failed_urls:
    print(f"\nFailed ({len(failed_urls)}):")
    for u in failed_urls:
        print(f"  - {u}")