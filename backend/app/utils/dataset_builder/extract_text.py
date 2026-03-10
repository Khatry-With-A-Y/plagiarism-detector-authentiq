import pdfplumber
import os

def extract_pdf_text(path):
    text = ""
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += t + "\n"
        return text
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return ""

script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))
pdf_dir = os.path.join(backend_dir, "data", "raw_papers")

texts = {}

if not os.path.isdir(pdf_dir):
    print(f"PDF directory not found: {pdf_dir}")
else:
    for file in os.listdir(pdf_dir):
        if file.lower().endswith(".pdf"):
            path = os.path.join(pdf_dir, file)
            print(f"Processing: {file}")
            text = extract_pdf_text(path)
            if text.strip():  # only keep if we got some content
                texts[file] = text
            else:
                print(f"  → No text extracted from {file}")

print(f"\nExtracted text from {len(texts)} documents")
print(f"PDF folder used: {pdf_dir}")

# Optional: save the extracted texts to a file
# output_json = os.path.join(pdf_dir, "extracted_texts.json")
# with open(output_json, "w", encoding="utf-8") as f:
#     json.dump(texts, f, ensure_ascii=False, indent=2)
# print(f"Saved extracted texts to: {output_json}")