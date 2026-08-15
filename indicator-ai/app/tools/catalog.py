import re

from app.domain.schemas import CatalogItem
from app.understanding.language import normalize_human_text

CONTEXT_PRODUCT_PREFIX = "__indicator_context_product__:"


AVAILABILITY = re.compile(
    r"^(?:(?:ใน)?ร้าน(?:นี้)?|ที่นี่|เว็บ(?:นี้)?|เว็บไซต์(?:นี้)?)?\s*มี(.+?)(?:ไหม|มั้ย|มัย|หรือเปล่า|รึเปล่า|หรือไม่)[?？]*$",
    re.IGNORECASE,
)
RECOMMENDATION = re.compile(r"(?:มีอะไร(?:แนะนำ|น่าสนใจ|ขายดี)|แนะนำ|ยอดนิยม|best\s*seller|recommend)", re.IGNORECASE)


def normalize(value: str) -> str:
    return re.sub(r"[^\w\u0E00-\u0E7F]", "", normalize_human_text(value))


def availability_subject(message: str) -> str:
    match = AVAILABILITY.match(message.strip())
    if not match:
        return ""
    # Thai visitors naturally write "มีลำโพงขายไหม".  The word "ขาย" is
    # an availability cue, not part of the product name.
    return re.sub(r"(?:ขาย|อยู่|บ้าง|ด้วย|หน่อย)$", "", match.group(1).strip(), flags=re.IGNORECASE).strip()


def is_recommendation(message: str) -> bool:
    return bool(RECOMMENDATION.search(message))


def is_context_marker(item: CatalogItem) -> bool:
    return item.name.casefold().startswith(CONTEXT_PRODUCT_PREFIX)


class CatalogTool:
    """Read-only catalog tool. It returns raw facts, not model-written text."""

    @staticmethod
    def search(catalog: list[CatalogItem], query: str, limit: int = 5) -> list[CatalogItem]:
        needle = normalize(availability_subject(query) or query)
        if not needle:
            return []
        matches: list[CatalogItem] = []
        for item in catalog:
            # A widget may add one private, request-only context marker while
            # an old Node bridge is being upgraded. It identifies a prior
            # product, but is never itself a product record or source.
            if is_context_marker(item):
                continue
            haystack = normalize(" ".join([item.name, item.description, *item.keywords]))
            item_name = normalize(item.name)
            # A customer normally wraps the product name in polite words
            # ("ช่วยหา ... ให้หน่อย"). Match the canonical item name inside
            # that sentence instead of requiring the whole sentence to match.
            if needle in haystack or haystack in needle or (len(item_name) >= 4 and item_name in needle):
                matches.append(item)
        return matches[:limit]

    @staticmethod
    def recommend(catalog: list[CatalogItem], limit: int = 6) -> list[CatalogItem]:
        seen: set[str] = set()
        output: list[CatalogItem] = []
        for item in catalog:
            if is_context_marker(item):
                continue
            key = normalize(item.name)
            if key and key not in seen:
                seen.add(key)
                output.append(item)
            if len(output) >= limit:
                break
        return output
