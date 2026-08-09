"""Command-line interface for Herbert."""

import argparse
import logging
import sys
from pathlib import Path
from typing import Sequence

from herbert.errors import HerbertError
from herbert.pdf import extract_text


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
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run Herbert and return a process exit code."""

    # pypdf can repair some malformed internal references while still reading a
    # document successfully. Those library warnings are useful to developers,
    # but they should not overwhelm a normal command-line user.
    logging.getLogger("pypdf").setLevel(logging.ERROR)

    args = build_parser().parse_args(argv)

    try:
        text = extract_text(args.pdf)
        if args.output:
            args.output.write_text(text, encoding="utf-8")
            print(f"提取完成：{args.output}")
        else:
            print(text)
    except HerbertError as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"错误：无法写入输出文件：{exc}", file=sys.stderr)
        return 1

    return 0
