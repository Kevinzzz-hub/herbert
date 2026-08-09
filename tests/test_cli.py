"""Tests for Herbert's command-line interface."""

import logging
from pathlib import Path

from herbert.cleaning import (
    EXACT_DUPLICATE,
    POSSIBLE_GARBLED_TEXT,
    POSSIBLE_WORD_JOINING,
    SPARSE_TEXT,
    SUSPICIOUS_BULLET_ENCODING,
)
from herbert.cli import main
from herbert.models import ExtractedDocument, PageText


def fake_document(*, flags: tuple[str, ...] = ()) -> ExtractedDocument:
    """Create a one-page result for command-line tests."""

    return ExtractedDocument(
        pages=(
            PageText(
                page_number=1,
                raw_text="Raw extracted text",
                cleaned_text="Cleaned extracted text",
                quality_flags=flags,
                duplicate_of=1 if EXACT_DUPLICATE in flags else None,
            ),
        )
    )


def test_cli_prints_extracted_text(
    monkeypatch, tmp_path: Path, capsys
) -> None:
    pdf_file = tmp_path / "document.pdf"
    pdf_file.touch()
    monkeypatch.setattr("herbert.cli.extract_document", lambda _: fake_document())

    exit_code = main([str(pdf_file)])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert captured.out == "--- Page 1 ---\nCleaned extracted text\n"


def test_cli_saves_extracted_text(
    monkeypatch, tmp_path: Path, capsys
) -> None:
    pdf_file = tmp_path / "document.pdf"
    output_file = tmp_path / "document.txt"
    pdf_file.touch()
    monkeypatch.setattr("herbert.cli.extract_document", lambda _: fake_document())

    exit_code = main([str(pdf_file), "--output", str(output_file)])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert output_file.read_text(encoding="utf-8") == (
        "--- Page 1 ---\nCleaned extracted text"
    )
    assert "提取完成" in captured.out


def test_cli_can_output_raw_text(monkeypatch, tmp_path: Path, capsys) -> None:
    pdf_file = tmp_path / "document.pdf"
    pdf_file.touch()
    monkeypatch.setattr("herbert.cli.extract_document", lambda _: fake_document())

    exit_code = main([str(pdf_file), "--raw"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert captured.out == "--- Page 1 ---\nRaw extracted text\n"


def test_cli_reports_quality_warnings(monkeypatch, tmp_path: Path, capsys) -> None:
    pdf_file = tmp_path / "document.pdf"
    pdf_file.touch()
    flags = (
        SPARSE_TEXT,
        POSSIBLE_GARBLED_TEXT,
        POSSIBLE_WORD_JOINING,
        SUSPICIOUS_BULLET_ENCODING,
        EXACT_DUPLICATE,
    )
    monkeypatch.setattr(
        "herbert.cli.extract_document", lambda _: fake_document(flags=flags)
    )

    exit_code = main([str(pdf_file)])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "1 页文字较少" in captured.err
    assert "1 页疑似乱码" in captured.err
    assert "1 页可能存在词语黏连" in captured.err
    assert "1 页可能存在项目符号编码异常" in captured.err
    assert "1 页与前文重复或高度相似" in captured.err
    assert "第1页" in captured.err
    assert "1→1" in captured.err


def test_cli_hides_recoverable_pypdf_warnings(
    monkeypatch, tmp_path: Path
) -> None:
    pdf_file = tmp_path / "document.pdf"
    pdf_file.touch()
    monkeypatch.setattr("herbert.cli.extract_document", lambda _: fake_document())
    pypdf_logger = logging.getLogger("pypdf")
    previous_level = pypdf_logger.level
    pypdf_logger.setLevel(logging.WARNING)

    try:
        main([str(pdf_file)])
        assert pypdf_logger.level == logging.ERROR
    finally:
        pypdf_logger.setLevel(previous_level)
