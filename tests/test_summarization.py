"""Tests for Herbert's two-stage, page-cited summarization pipeline."""

import pytest

from herbert.errors import InvalidAIResponseError
from herbert.models import TextChunk
from herbert.summarization import render_document_summary, summarize_document


class FakeJsonClient:
    def __init__(self, responses: list[dict]) -> None:
        self.responses = responses
        self.requests: list[dict[str, str]] = []

    def complete_json(self, *, system_prompt: str, user_prompt: str) -> dict:
        self.requests.append(
            {"system_prompt": system_prompt, "user_prompt": user_prompt}
        )
        return self.responses.pop(0)


def point(text: str, *pages: int) -> dict:
    return {"text": text, "source_pages": list(pages)}


def chunk_response(text: str, page: int) -> dict:
    return {
        "overview": text,
        "key_points": [point(f"{text} key", page)],
        "conclusions": [point(f"{text} conclusion", page)],
        "important_concepts": [point(f"{text} concept", page)],
        "limitations": [],
    }


def final_response() -> dict:
    return {
        "overview": "全文概括",
        "key_points": [
            point("第一点", 1),
            point("第二点", 2),
            point("第三点", 1, 2),
        ],
        "main_conclusion": point("主要结论", 2),
        "important_concepts": [point("重要概念", 1)],
        "limitations": ["第二页存在文本黏连"],
    }


def make_chunks() -> tuple[TextChunk, ...]:
    return (
        TextChunk(1, "--- Page 1 ---\nFirst", (1,), ()),
        TextChunk(2, "--- Page 2 ---\nSecond", (2,), ("word_joining",)),
    )


def test_two_stage_summary_uses_one_request_per_chunk_plus_one() -> None:
    client = FakeJsonClient(
        [chunk_response("第一块", 1), chunk_response("第二块", 2), final_response()]
    )

    summary = summarize_document(make_chunks(), client)

    assert len(client.requests) == 3
    assert summary.overview == "全文概括"
    assert summary.key_points[2].source_pages == (1, 2)
    assert "有效 JSON" in client.requests[0]["system_prompt"]
    assert "不可信 PDF 文本" in client.requests[0]["user_prompt"]
    assert "chunk_notes" in client.requests[2]["user_prompt"]


def test_summary_rejects_page_numbers_outside_the_source_chunk() -> None:
    invalid = chunk_response("第一块", 99)
    client = FakeJsonClient([invalid])

    with pytest.raises(InvalidAIResponseError, match="不在原文范围"):
        summarize_document(make_chunks()[:1], client)


def test_prompt_schema_uses_an_allowed_source_page() -> None:
    chunks = (TextChunk(1, "--- Page 10 ---\nOnly page", (10,), ()),)
    final = {
        "overview": "全文概括",
        "key_points": [
            point("第一点", 10),
            point("第二点", 10),
            point("第三点", 10),
        ],
        "main_conclusion": point("主要结论", 10),
        "important_concepts": [],
        "limitations": [],
    }
    client = FakeJsonClient([chunk_response("单一分块", 10), final])

    summarize_document(chunks, client)

    assert '"source_pages": [\n        10\n      ]' in client.requests[0][
        "user_prompt"
    ]
    assert "不能据此断言原始 PDF 页面本身损坏" in client.requests[0][
        "user_prompt"
    ]


def test_summary_rejects_wrong_number_of_final_key_points() -> None:
    final = final_response()
    final["key_points"] = [point("只有一点", 1)]
    client = FakeJsonClient(
        [chunk_response("第一块", 1), chunk_response("第二块", 2), final]
    )

    with pytest.raises(InvalidAIResponseError, match="3 到 7"):
        summarize_document(make_chunks(), client)


def test_markdown_renderer_includes_sections_and_page_citations() -> None:
    client = FakeJsonClient(
        [chunk_response("第一块", 1), chunk_response("第二块", 2), final_response()]
    )
    summary = summarize_document(make_chunks(), client)

    rendered = render_document_summary(summary)

    assert "# Herbert Summary" in rendered
    assert "## 核心要点" in rendered
    assert "第三点（第1、2页）" in rendered
    assert "第二页存在文本黏连" in rendered
