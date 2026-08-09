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


def extract_text(pdf_path: str | Path) -> str:
    """Extract readable text from a text-based PDF.

    Args:
        pdf_path: Path to the PDF file.

    Returns:
        Text from all non-empty pages, separated by blank lines.

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

        page_texts = []
        for page in reader.pages:
            text = page.extract_text()
            if text and text.strip():
                page_texts.append(text.strip())
    except UnreadablePdfError:
        raise
    except (PdfReadError, OSError, ValueError) as exc:
        raise UnreadablePdfError("无法读取此 PDF，文件可能已经损坏。") from exc

    combined_text = "\n\n".join(page_texts)
    if not combined_text:
        raise NoExtractableTextError(
            "此 PDF 暂不适用，请上传能够复制文字的 PDF。"
        )

    return combined_text
