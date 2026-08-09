"""Split structured PDF text into bounded, traceable chunks."""

from herbert.models import ExtractedDocument, PageText, TextChunk

DEFAULT_MAX_CHARACTERS = 4_000
MIN_MAX_CHARACTERS = 200


def chunk_document(
    document: ExtractedDocument,
    *,
    max_characters: int = DEFAULT_MAX_CHARACTERS,
) -> tuple[TextChunk, ...]:
    """Group cleaned pages without exceeding a character limit.

    Whole pages stay together whenever possible. A page that exceeds the limit
    is split without deleting characters, and every fragment retains its page
    marker.
    """

    if max_characters < MIN_MAX_CHARACTERS:
        raise ValueError(
            f"分块大小不能小于 {MIN_MAX_CHARACTERS} 个字符。"
        )

    chunks = []
    current_blocks: list[str] = []
    current_pages: list[int] = []
    current_flags: list[str] = []
    current_length = 0

    for page in document.pages:
        for block in _page_blocks(page, max_characters):
            separator_length = 2 if current_blocks else 0
            projected_length = current_length + separator_length + len(block)

            if current_blocks and projected_length > max_characters:
                chunks.append(
                    _build_chunk(
                        len(chunks) + 1,
                        current_blocks,
                        current_pages,
                        current_flags,
                    )
                )
                current_blocks = []
                current_pages = []
                current_flags = []
                current_length = 0
                separator_length = 0

            current_blocks.append(block)
            current_length += separator_length + len(block)
            if page.page_number not in current_pages:
                current_pages.append(page.page_number)
            for flag in page.quality_flags:
                if flag not in current_flags:
                    current_flags.append(flag)

    if current_blocks:
        chunks.append(
            _build_chunk(
                len(chunks) + 1,
                current_blocks,
                current_pages,
                current_flags,
            )
        )

    return tuple(chunks)


def render_chunks(chunks: tuple[TextChunk, ...]) -> str:
    """Render chunks in a human-readable format suitable for inspection."""

    rendered = []
    for chunk in chunks:
        page_label = _format_page_label(chunk.source_pages)
        header = (
            f"=== Chunk {chunk.chunk_number} | {page_label} | "
            f"{chunk.character_count} chars ==="
        )
        rendered.append(f"{header}\n{chunk.text}")
    return "\n\n".join(rendered)


def _page_blocks(page: PageText, max_characters: int) -> tuple[str, ...]:
    """Return one or more bounded blocks for a single non-empty page."""

    if not page.cleaned_text:
        return ()

    continued_header = f"--- Page {page.page_number} (continued) ---"
    content_limit = max_characters - len(continued_header) - 1
    fragments = _split_content(page.cleaned_text, content_limit)

    blocks = []
    for index, fragment in enumerate(fragments):
        if index == 0:
            header = f"--- Page {page.page_number} ---"
        else:
            header = continued_header
        blocks.append(f"{header}\n{fragment}")
    return tuple(blocks)


def _split_content(text: str, max_characters: int) -> tuple[str, ...]:
    """Split at existing line boundaries, hard-splitting only oversized lines."""

    fragments = []
    current_lines: list[str] = []
    current_length = 0

    for line in text.splitlines():
        pieces = (
            [line]
            if len(line) <= max_characters
            else [
                line[start : start + max_characters]
                for start in range(0, len(line), max_characters)
            ]
        )

        for piece in pieces:
            separator_length = 1 if current_lines else 0
            if current_lines and (
                current_length + separator_length + len(piece) > max_characters
            ):
                fragments.append("\n".join(current_lines))
                current_lines = []
                current_length = 0
                separator_length = 0

            current_lines.append(piece)
            current_length += separator_length + len(piece)

    if current_lines:
        fragments.append("\n".join(current_lines))

    return tuple(fragments)


def _build_chunk(
    chunk_number: int,
    blocks: list[str],
    source_pages: list[int],
    quality_flags: list[str],
) -> TextChunk:
    """Freeze accumulated chunk data into an immutable result."""

    return TextChunk(
        chunk_number=chunk_number,
        text="\n\n".join(blocks),
        source_pages=tuple(source_pages),
        quality_flags=tuple(quality_flags),
    )


def _format_page_label(source_pages: tuple[int, ...]) -> str:
    """Format one page or a continuous page range for a chunk header."""

    if not source_pages:
        return "No pages"
    if len(source_pages) == 1:
        return f"Page {source_pages[0]}"
    return f"Pages {source_pages[0]}-{source_pages[-1]}"
