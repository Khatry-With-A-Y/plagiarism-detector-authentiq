# import pdfplumber
# import os

# def extract_pdf_text(path):
#     text = ""
#     with pdfplumber.open(path) as pdf:
#         for page in pdf.pages:
#             t = page.extract_text()
#             if t:
#                 text += t + "\n"
#     return text


# texts = {}

# for file in os.listdir("pdfs"):
#     if file.endswith(".pdf"):
#         path = os.path.join("pdfs", file)
#         texts[file] = extract_pdf_text(path)

# print("Extracted", len(texts), "documents")