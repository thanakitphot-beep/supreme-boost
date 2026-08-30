"""Small, auditable language-understanding utilities.

This layer deliberately normalizes *wording* rather than inventing facts. It
lets the retrieval and policy layers treat conversational Thai variants as the
same intent while preserving the source text used for a final citation.
"""

import re
import unicodedata

_SPACE = re.compile(r"\s+")
_PACKAGE_VARIANTS = re.compile(r"(?:แพคเกจ|แพ็กเกจ|แพ็คเกจ|แพกเกจ|package|packages|plans?)", re.IGNORECASE)
_PACKAGE_QUESTION = re.compile(
    r"(?:แพคเกจ|แพ็กเกจ|แพ็คเกจ|แพกเกจ|package|plans?|แพลน|ราคา.*(?:รายเดือน|โปร|แพ็กเกจ))",
    re.IGNORECASE,
)


def normalize_human_text(value: str) -> str:
    """Normalize harmless Thai/English spelling variants for intent matching."""

    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = text.replace("\u0e4d\u0e32", "\u0e33").replace("\u200b", "")
    text = _PACKAGE_VARIANTS.sub("แพ็กเกจ", text)
    return _SPACE.sub(" ", text).strip()


def is_package_question(message: str) -> bool:
    return bool(_PACKAGE_QUESTION.search(normalize_human_text(message)))


def _window(text: str, index: int, radius: int = 260) -> str:
    start = max(0, index - radius // 2)
    end = min(len(text), index + radius)
    # Prefer word boundaries where they exist, while still working on Thai.
    if start:
        left = text.find(" ", start)
        if left >= 0:
            start = left + 1
    if end < len(text):
        right = text.rfind(" ", 0, end)
        if right > start:
            end = right
    return _SPACE.sub(" ", text[start:end]).strip()


def relevant_excerpt(content: str, message: str, limit: int = 520) -> str:
    """Return source text near the requested subject, never the page opener."""

    raw = _SPACE.sub(" ", str(content or "")).strip()
    if not raw:
        return ""
    candidates: list[str] = []
    if is_package_question(message):
        candidates.extend(["แพ็กเกจ", "Starter", "Pro Matrix", "Enterprise"])
    candidates.extend(re.findall(r"[\w\u0E00-\u0E7F]{3,}", str(message or "")))
    lower = raw.casefold()
    positions = [lower.find(candidate.casefold()) for candidate in candidates if candidate and lower.find(candidate.casefold()) >= 0]
    if not positions:
        return raw[:limit].strip()
    excerpt = _window(raw, min(positions), max(limit, 320))
    return excerpt[:limit].strip()


def package_summary(content: str, message: str) -> str | None:
    """Extract only published plan names and prices from a public page."""

    if not is_package_question(message):
        return None
    raw = _SPACE.sub(" ", str(content or "")).strip()
    if not raw:
        return None
    plans: list[str] = []
    for name in ("Starter", "Pro Matrix", "Enterprise"):
        match = re.search(rf"\b{re.escape(name)}\b(.{{0,220}})", raw, re.IGNORECASE)
        if not match:
            continue
        block = match.group(0)
        price = re.search(r"(?:฿\s*[\d,]+(?:\s*/\s*เดือน)?|ติดต่อเรา)", block, re.IGNORECASE)
        if price:
            plans.append(f"{name} {price.group(0).replace(' ', '')}")
    if len(plans) < 2:
        return None
    return f"ตอนนี้มี {len(plans)} แพ็กเกจครับ: {', '.join(plans)}"
