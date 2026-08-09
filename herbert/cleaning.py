"""Conservative cleanup and quality checks for extracted PDF text."""

from dataclasses import replace
from difflib import SequenceMatcher
import re
import unicodedata

from herbert.models import PageText

SPARSE_TEXT = "sparse_text"
POSSIBLE_GARBLED_TEXT = "possible_garbled_text"
POSSIBLE_WORD_JOINING = "possible_word_joining"
SUSPICIOUS_BULLET_ENCODING = "suspicious_bullet_encoding"
EXACT_DUPLICATE = "exact_duplicate"
NEAR_DUPLICATE = "near_duplicate"

_MIN_MEANINGFUL_CHARACTERS = 50
_NEAR_DUPLICATE_THRESHOLD = 0.97
_COMMON_PUNCTUATION = set(
    ".,;:!?，。；：！？、()（）[]【】{}<>《》'\"“”‘’+-–—_/%•#"
)


def clean_page_text(raw_text: str, page_number: int) -> str:
    """Apply only cleanup rules that do not guess or rewrite meaning."""

    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]*•[ \t]*", "\n• ", text)

    cleaned_lines = []
    for raw_line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", raw_line).strip()
        if not line or line == str(page_number):
            continue
        cleaned_lines.append(line)

    return "\n".join(cleaned_lines)


def assess_page_quality(raw_text: str, cleaned_text: str) -> tuple[str, ...]:
    """Return explainable warning flags without changing page content."""

    flags = []
    meaningful_characters = sum(character.isalnum() for character in cleaned_text)

    if meaningful_characters < _MIN_MEANINGFUL_CHARACTERS:
        flags.append(SPARSE_TEXT)

    if _looks_garbled(cleaned_text):
        flags.append(POSSIBLE_GARBLED_TEXT)

    joined_word_boundaries = re.findall(r"(?<=[a-z])(?=[A-Z])", cleaned_text)
    if len(joined_word_boundaries) >= 2:
        flags.append(POSSIBLE_WORD_JOINING)

    suspicious_bullets = re.findall(r"(?<=[a-z])n(?=[A-Z])", raw_text)
    if len(suspicious_bullets) >= 3:
        flags.append(SUSPICIOUS_BULLET_ENCODING)

    return tuple(flags)


def mark_duplicate_pages(pages: list[PageText]) -> tuple[PageText, ...]:
    """Mark repeated pages while preserving every page and its original order."""

    marked_pages = []
    signatures = []

    for page in pages:
        signature = _comparison_signature(page.cleaned_text)
        duplicate_of = None
        duplicate_flag = None

        if len(signature) >= _MIN_MEANINGFUL_CHARACTERS:
            for previous_page, previous_signature in zip(marked_pages, signatures):
                if signature == previous_signature:
                    duplicate_of = previous_page.page_number
                    duplicate_flag = EXACT_DUPLICATE
                    break

                length_ratio = min(len(signature), len(previous_signature)) / max(
                    len(signature), len(previous_signature)
                )
                if length_ratio < _NEAR_DUPLICATE_THRESHOLD:
                    continue

                similarity = SequenceMatcher(
                    None, signature, previous_signature, autojunk=False
                ).ratio()
                if similarity >= _NEAR_DUPLICATE_THRESHOLD:
                    duplicate_of = previous_page.page_number
                    duplicate_flag = NEAR_DUPLICATE
                    break

        if duplicate_flag:
            page = replace(
                page,
                quality_flags=page.quality_flags + (duplicate_flag,),
                duplicate_of=duplicate_of,
            )

        marked_pages.append(page)
        signatures.append(signature)

    return tuple(marked_pages)


def _comparison_signature(text: str) -> str:
    """Normalize formatting differences for duplicate-page comparison."""

    return "".join(character.casefold() for character in text if character.isalnum())


def _looks_garbled(text: str) -> bool:
    """Detect symbol-heavy text that is likely caused by a broken font map."""

    visible_characters = [character for character in text if not character.isspace()]
    if len(visible_characters) < _MIN_MEANINGFUL_CHARACTERS:
        return False

    alphanumeric_count = 0
    suspicious_count = 0
    for character in visible_characters:
        category = unicodedata.category(character)
        if character.isalnum():
            alphanumeric_count += 1
            continue
        if character in _COMMON_PUNCTUATION:
            continue
        if category.startswith("P"):
            continue
        suspicious_count += 1

    alphanumeric_ratio = alphanumeric_count / len(visible_characters)
    suspicious_ratio = suspicious_count / len(visible_characters)
    return alphanumeric_ratio < 0.65 and suspicious_ratio >= 0.05
