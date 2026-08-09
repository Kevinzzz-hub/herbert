"""Tests for page-aware document chunking."""

import pytest

from herbert.chunking import chunk_document, render_chunks
from herbert.models import ExtractedDocument, PageText


def make_page(
    page_number: int,
    text: str,
    *,
    flags: tuple[str, ...] = (),
) -> PageText:
    """Create a structured page for chunking tests."""

    return PageText(
        page_number=page_number,
        raw_text=text,
        cleaned_text=text,
        quality_flags=flags,
    )


def test_whole_pages_are_grouped_without_exceeding_limit() -> None:
    document = ExtractedDocument(
        pages=(
            make_page(1, "A" * 70),
            make_page(2, "B" * 70, flags=("sparse_text",)),
            make_page(3, "C" * 70),
        )
    )

    chunks = chunk_document(document, max_characters=200)

    assert len(chunks) == 2
    assert chunks[0].source_pages == (1, 2)
    assert chunks[1].source_pages == (3,)
    assert "sparse_text" in chunks[0].quality_flags
    assert all(chunk.character_count <= 200 for chunk in chunks)


def test_oversized_page_is_split_without_losing_characters() -> None:
    original_text = "X" * 450
    document = ExtractedDocument(pages=(make_page(7, original_text),))

    chunks = chunk_document(document, max_characters=200)

    assert len(chunks) == 3
    assert all(chunk.source_pages == (7,) for chunk in chunks)
    assert all(chunk.character_count <= 200 for chunk in chunks)
    recovered_text = "".join(chunk.text.split("\n", 1)[1] for chunk in chunks)
    assert recovered_text == original_text
    assert "--- Page 7 (continued) ---" in chunks[1].text


def test_empty_pages_are_not_sent_to_the_model() -> None:
    document = ExtractedDocument(
        pages=(make_page(1, ""), make_page(2, "Useful content"))
    )

    chunks = chunk_document(document, max_characters=200)

    assert len(chunks) == 1
    assert chunks[0].source_pages == (2,)


def test_chunk_size_has_a_safe_minimum() -> None:
    document = ExtractedDocument(pages=(make_page(1, "Useful content"),))

    with pytest.raises(ValueError, match="不能小于 200"):
        chunk_document(document, max_characters=199)


def test_rendered_chunks_include_chunk_and_page_metadata() -> None:
    document = ExtractedDocument(pages=(make_page(3, "Useful content"),))
    chunks = chunk_document(document, max_characters=200)

    rendered = render_chunks(chunks)

    assert "=== Chunk 1 | Page 3 |" in rendered
    assert "--- Page 3 ---" in rendered
