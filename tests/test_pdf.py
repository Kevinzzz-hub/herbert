"""Tests for PDF text extraction."""

from pathlib import Path

import pytest
from pypdf.errors import PdfReadError

from herbert.cleaning import (
    EXACT_DUPLICATE,
    NEAR_DUPLICATE,
    POSSIBLE_GARBLED_TEXT,
    POSSIBLE_WORD_JOINING,
    SPARSE_TEXT,
    SUSPICIOUS_BULLET_ENCODING,
)
from herbert.errors import (
    InputFileNotFoundError,
    NoExtractableTextError,
    UnreadablePdfError,
    UnsupportedFileTypeError,
)
from herbert.pdf import extract_document, extract_text


class FakePage:
    """A small stand-in for a pypdf page used by unit tests."""

    def __init__(self, text: str | None) -> None:
        self.text = text

    def extract_text(self) -> str | None:
        return self.text


class FakeReader:
    """A small stand-in for PdfReader used by unit tests."""

    def __init__(self, pages: list[FakePage], *, encrypted: bool = False) -> None:
        self.pages = pages
        self.is_encrypted = encrypted


def create_input_file(tmp_path: Path, name: str = "document.pdf") -> Path:
    """Create an empty placeholder file for tests that mock PdfReader."""

    path = tmp_path / name
    path.touch()
    return path


def test_missing_file_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(InputFileNotFoundError, match="找不到文件"):
        extract_text(tmp_path / "missing.pdf")


def test_non_pdf_file_is_rejected(tmp_path: Path) -> None:
    text_file = create_input_file(tmp_path, "notes.txt")

    with pytest.raises(UnsupportedFileTypeError, match="文件格式不支持"):
        extract_text(text_file)


def test_document_preserves_raw_and_cleaned_page_text(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    pdf_file = create_input_file(tmp_path)
    fake_reader = FakeReader(
        [
            FakePage("Heading•First item•Second item"),
            FakePage("Second page.\n2"),
        ]
    )
    monkeypatch.setattr("herbert.pdf.PdfReader", lambda _: fake_reader)

    document = extract_document(pdf_file)

    assert document.pages[0].raw_text == "Heading•First item•Second item"
    assert document.pages[0].cleaned_text == "Heading\n• First item\n• Second item"
    assert document.pages[1].cleaned_text == "Second page."
    assert extract_text(pdf_file) == (
        "--- Page 1 ---\nHeading\n• First item\n• Second item\n\n"
        "--- Page 2 ---\nSecond page."
    )


def test_quality_flags_are_explainable(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    pdf_file = create_input_file(tmp_path)
    fake_reader = FakeReader(
        [
            FakePage("Short title"),
            FakePage("QualityProcessToolsMethods make software easier to understand."),
            FakePage(
                "FrameworknCommunicationnPlanningnModelingnConstruction and testing"
            ),
            FakePage(("A+$" * 40) + " broken font map"),
        ]
    )
    monkeypatch.setattr("herbert.pdf.PdfReader", lambda _: fake_reader)

    document = extract_document(pdf_file)

    assert SPARSE_TEXT in document.pages[0].quality_flags
    assert POSSIBLE_WORD_JOINING in document.pages[1].quality_flags
    assert SUSPICIOUS_BULLET_ENCODING in document.pages[2].quality_flags
    assert POSSIBLE_GARBLED_TEXT in document.pages[3].quality_flags


def test_exact_and_near_duplicate_pages_are_marked(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    pdf_file = create_input_file(tmp_path)
    original = "Software testing fundamentals and basic path testing techniques."
    near_copy = "Software testing fundamentals and basis path testing techniques."
    fake_reader = FakeReader(
        [FakePage(original), FakePage(original), FakePage(near_copy)]
    )
    monkeypatch.setattr("herbert.pdf.PdfReader", lambda _: fake_reader)

    document = extract_document(pdf_file)

    assert EXACT_DUPLICATE in document.pages[1].quality_flags
    assert document.pages[1].duplicate_of == 1
    assert NEAR_DUPLICATE in document.pages[2].quality_flags
    assert document.pages[2].duplicate_of == 1


def test_pdf_without_text_is_rejected(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    pdf_file = create_input_file(tmp_path)
    fake_reader = FakeReader([FakePage(None), FakePage("  ")])
    monkeypatch.setattr("herbert.pdf.PdfReader", lambda _: fake_reader)

    with pytest.raises(NoExtractableTextError, match="此 PDF 暂不适用"):
        extract_text(pdf_file)


def test_encrypted_pdf_is_rejected(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    pdf_file = create_input_file(tmp_path)
    fake_reader = FakeReader([], encrypted=True)
    monkeypatch.setattr("herbert.pdf.PdfReader", lambda _: fake_reader)

    with pytest.raises(UnreadablePdfError, match="加密"):
        extract_text(pdf_file)


def test_damaged_pdf_is_rejected(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    pdf_file = create_input_file(tmp_path)

    def fail_to_read(_: Path) -> None:
        raise PdfReadError("broken")

    monkeypatch.setattr("herbert.pdf.PdfReader", fail_to_read)

    with pytest.raises(UnreadablePdfError, match="无法读取"):
        extract_text(pdf_file)
