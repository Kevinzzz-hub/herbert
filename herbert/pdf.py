"""PDF text extraction for Herbert."""

from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from herbert.errors import (
    InputFileNotFoundError,
    NoExtractableTextError,
    UnreadablePdfError,
    UnsupportedFileTypeError,
)
from herbert.cleaning import assess_page_quality, clean_page_text, mark_duplicate_pages
from herbert.models import ExtractedDocument, PageText


def extract_document(pdf_path: str | Path) -> ExtractedDocument:
    """Extract a PDF into ordered pages with cleanup and quality metadata.

    Args:
        pdf_path: Path to the PDF file.

    Returns:
        Structured raw and cleaned text for every page.

    Raises:
        InputFileNotFoundError: If the path does not point to a file.
        UnsupportedFileTypeError: If the file does not have a .pdf suffix.
        UnreadablePdfError: If pypdf cannot read the document.
        NoExtractableTextError: If the document has no usable text layer.
    """

    path = Path(pdf_path)

    if not path.is_file():
        raise InputFileNotFoundError(f"找不到文件：{path}")

    if path.suffix.lower() != ".pdf":
        raise UnsupportedFileTypeError("文件格式不支持，请重新上传 PDF 文件。")

    try:
        reader = PdfReader(path)
        if reader.is_encrypted:
            raise UnreadablePdfError("暂不支持加密的 PDF 文件。")

        pages = []
        for page_number, page in enumerate(reader.pages, start=1):
            raw_text = page.extract_text() or ""
            cleaned_text = clean_page_text(raw_text, page_number)
            pages.append(
                PageText(
                    page_number=page_number,
                    raw_text=raw_text,
                    cleaned_text=cleaned_text,
                    quality_flags=assess_page_quality(raw_text, cleaned_text),
                )
            )
    except UnreadablePdfError:
        raise
    except (PdfReadError, OSError, ValueError) as exc:
        raise UnreadablePdfError("无法读取此 PDF，文件可能已经损坏。") from exc

    if not any(page.cleaned_text for page in pages):
        raise NoExtractableTextError(
            "此 PDF 暂不适用，请上传能够复制文字的 PDF。"
        )

    return ExtractedDocument(pages=mark_duplicate_pages(pages))


def extract_text(pdf_path: str | Path) -> str:
    """Extract cleaned text with page markers for backward compatibility."""

    return extract_document(pdf_path).to_text()
