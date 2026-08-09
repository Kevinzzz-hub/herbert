"""Command-line interface for Herbert."""

import argparse
import logging
import sys
from pathlib import Path
from typing import Sequence

from herbert.errors import HerbertError
from herbert.cleaning import (
    EXACT_DUPLICATE,
    NEAR_DUPLICATE,
    POSSIBLE_GARBLED_TEXT,
    POSSIBLE_WORD_JOINING,
    SPARSE_TEXT,
    SUSPICIOUS_BULLET_ENCODING,
)
from herbert.models import ExtractedDocument
from herbert.pdf import extract_document


def build_parser() -> argparse.ArgumentParser:
    """Build and return Herbert's command-line argument parser."""

    parser = argparse.ArgumentParser(
        prog="herbert",
        description="Extract readable text from a PDF document.",
    )
    parser.add_argument("pdf", type=Path, help="path to a text-based PDF")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="save extracted text to this file instead of printing it",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="output uncleaned text while retaining page markers",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run Herbert and return a process exit code."""

    # pypdf can repair some malformed internal references while still reading a
    # document successfully. Those library warnings are useful to developers,
    # but they should not overwhelm a normal command-line user.
    logging.getLogger("pypdf").setLevel(logging.ERROR)

    args = build_parser().parse_args(argv)

    try:
        document = extract_document(args.pdf)
        text = document.to_text(raw=args.raw)
        if args.output:
            args.output.write_text(text, encoding="utf-8")
            print(f"提取完成：{args.output}")
        else:
            print(text)
        quality_message = format_quality_message(document)
        if quality_message:
            print(quality_message, file=sys.stderr)
    except HerbertError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"错误：无法写入输出文件：{exc}", file=sys.stderr)
        return 1

    return 0


def format_quality_message(document: ExtractedDocument) -> str:
    """Summarize page-quality warnings for a command-line user."""

    messages = []

    _append_flag_message(messages, document, SPARSE_TEXT, "文字较少")
    _append_flag_message(messages, document, POSSIBLE_GARBLED_TEXT, "疑似乱码")
    _append_flag_message(
        messages, document, POSSIBLE_WORD_JOINING, "可能存在词语黏连"
    )
    _append_flag_message(
        messages,
        document,
        SUSPICIOUS_BULLET_ENCODING,
        "可能存在项目符号编码异常",
    )

    duplicate_pages = [
        page
        for page in document.pages
        if EXACT_DUPLICATE in page.quality_flags
        or NEAR_DUPLICATE in page.quality_flags
    ]
    if duplicate_pages:
        relationships = "、".join(
            f"{page.page_number}→{page.duplicate_of}" for page in duplicate_pages
        )
        messages.append(
            f"{len(duplicate_pages)} 页与前文重复或高度相似"
            f"（当前页→来源页：{relationships}）"
        )

    if not messages:
        return ""
    return "质量提示：" + "；".join(messages) + "。"


def _append_flag_message(
    messages: list[str],
    document: ExtractedDocument,
    flag: str,
    description: str,
) -> None:
    """Append one quality message with the affected page numbers."""

    page_numbers = [
        str(page.page_number) for page in document.pages if flag in page.quality_flags
    ]
    if page_numbers:
        messages.append(
            f"{len(page_numbers)} 页{description}（第{'、'.join(page_numbers)}页）"
        )
