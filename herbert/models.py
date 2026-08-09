"""Structured extraction results used throughout Herbert."""

from collections import Counter
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PageText:
    """Raw and cleaned text extracted from one PDF page."""

    page_number: int
    raw_text: str
    cleaned_text: str
    quality_flags: tuple[str, ...] = ()
    duplicate_of: int | None = None


@dataclass(frozen=True, slots=True)
class ExtractedDocument:
    """A PDF represented as ordered, traceable pages of text."""

    pages: tuple[PageText, ...]

    def to_text(self, *, raw: bool = False) -> str:
        """Render pages as text with explicit page markers."""

        blocks = []
        for page in self.pages:
            content = page.raw_text if raw else page.cleaned_text
            blocks.append(f"--- Page {page.page_number} ---\n{content.strip()}".rstrip())
        return "\n\n".join(blocks)

    def quality_counts(self) -> Counter[str]:
        """Count how many pages carry each quality flag."""

        return Counter(flag for page in self.pages for flag in page.quality_flags)


@dataclass(frozen=True, slots=True)
class TextChunk:
    """A model-ready piece of text with traceable source pages."""

    chunk_number: int
    text: str
    source_pages: tuple[int, ...]
    quality_flags: tuple[str, ...] = ()

    @property
    def character_count(self) -> int:
        """Return the number of characters sent as chunk content."""

        return len(self.text)
