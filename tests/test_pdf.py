"""Tests for PDF text extraction."""

from pathlib import Path

import pytest
from pypdf.errors import PdfReadError

from herbert.errors import (
    InputFileNotFoundError,
    NoExtractableTextError,
    UnreadablePdfError,
    UnsupportedFileTypeError,
)
from herbert.pdf import extract_text


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


def test_text_from_pages_is_joined(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    pdf_file = create_input_file(tmp_path)
    fake_reader = FakeReader(
        [FakePage(" First page. "), FakePage("  "), FakePage("Second page.")]
    )
    monkeypatch.setattr("herbert.pdf.PdfReader", lambda _: fake_reader)

    assert extract_text(pdf_file) == "First page.\n\nSecond page."


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
