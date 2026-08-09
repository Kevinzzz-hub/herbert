"""Tests for Herbert's command-line interface."""

import logging
from pathlib import Path

from herbert.cli import main


def test_cli_prints_extracted_text(
    monkeypatch, tmp_path: Path, capsys
) -> None:
    pdf_file = tmp_path / "document.pdf"
    pdf_file.touch()
    monkeypatch.setattr("herbert.cli.extract_text", lambda _: "A useful summary source.")

    exit_code = main([str(pdf_file)])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert captured.out == "A useful summary source.\n"


def test_cli_saves_extracted_text(
    monkeypatch, tmp_path: Path, capsys
) -> None:
    pdf_file = tmp_path / "document.pdf"
    output_file = tmp_path / "document.txt"
    pdf_file.touch()
    monkeypatch.setattr("herbert.cli.extract_text", lambda _: "Extracted text")

    exit_code = main([str(pdf_file), "--output", str(output_file)])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert output_file.read_text(encoding="utf-8") == "Extracted text"
    assert "提取完成" in captured.out


def test_cli_hides_recoverable_pypdf_warnings(
    monkeypatch, tmp_path: Path
) -> None:
    pdf_file = tmp_path / "document.pdf"
    pdf_file.touch()
    monkeypatch.setattr("herbert.cli.extract_text", lambda _: "Extracted text")
    pypdf_logger = logging.getLogger("pypdf")
    previous_level = pypdf_logger.level
    pypdf_logger.setLevel(logging.WARNING)

    try:
        main([str(pdf_file)])
        assert pypdf_logger.level == logging.ERROR
    finally:
        pypdf_logger.setLevel(previous_level)
