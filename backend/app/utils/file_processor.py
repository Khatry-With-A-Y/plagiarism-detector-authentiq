import os
from pathlib import Path

def extract_text(file_path, file_type=None):
    """
    Extract text from various document formats.
    
    Args:
        file_path: Path to the file
        file_type: Optional file extension (e.g., '.pdf', '.docx')
                   If not provided, will be inferred from file_path
    
    Returns:
        str: Extracted text content
    """
    if file_type is None:
        file_type = Path(file_path).suffix.lower()
    
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    try:
        if file_type == '.txt':
            return extract_txt(file_path)
        elif file_type == '.pdf':
            return extract_pdf(file_path)
        elif file_type == '.docx':
            return extract_docx(file_path)
        elif file_type == '.doc':
            return extract_doc(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
    except Exception as e:
        raise Exception(f"Error extracting text from {file_path}: {str(e)}")


def extract_txt(file_path):
    """Extract text from .txt file"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read()


def extract_pdf(file_path):
    """Extract text from .pdf file"""
    try:
        import pdfplumber
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text
    except ImportError:
        # Fallback to PyPDF2 if pdfplumber is not available
        import PyPDF2
        text = ""
        with open(file_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        return text


def extract_docx(file_path):
    """Extract text from .docx file"""
    from docx import Document
    doc = Document(file_path)
    text = []
    for paragraph in doc.paragraphs:
        text.append(paragraph.text)
    return "\n".join(text)


def extract_doc(file_path):
    """Extract text from .doc file (older Word format)"""
    try:
        import docx2txt
        return docx2txt.process(str(file_path))
    except ImportError:
        # If docx2txt is not available, try to read as binary and extract
        # This is a fallback - .doc files are complex and may not extract perfectly
        raise ImportError(
            "python-docx2txt is required for .doc files. "
            "Install it with: pip install python-docx2txt"
        )


def validate_file(file_path, max_size=None, allowed_extensions=None):
    """
    Validate uploaded file.
    
    Args:
        file_path: Path to the file
        max_size: Maximum file size in bytes
        allowed_extensions: Set of allowed file extensions (e.g., {'.pdf', '.docx'})
    
    Returns:
        tuple: (is_valid, error_message)
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        return False, "File does not exist"
    
    if allowed_extensions:
        file_ext = file_path.suffix.lower()
        if file_ext not in allowed_extensions:
            return False, f"File type {file_ext} is not allowed. Allowed types: {', '.join(allowed_extensions)}"
    
    if max_size:
        file_size = file_path.stat().st_size
        if file_size > max_size:
            return False, f"File size ({file_size} bytes) exceeds maximum allowed size ({max_size} bytes)"
    
    return True, None