import re
from collections import defaultdict

from app.domain.schemas import KnowledgeDocument
from app.understanding.language import normalize_human_text


def _terms(text: str) -> set[str]:
    normalized = normalize_human_text(text)
    terms = {term for term in re.findall(r"[\w\u0E00-\u0E7F]{2,}", normalized) if term}
    # Thai often has no spaces. Add bounded character phrases so a query such
    # as "จัดส่งกี่วัน" can retrieve "จัดส่งภายใน 1-3 วันทำการ" without
    # pretending a whitespace tokenizer understands Thai word boundaries.
    thai = "".join(re.findall(r"[\u0E00-\u0E7F]", normalized))
    for length in range(3, min(8, len(thai)) + 1):
        terms.update(thai[index : index + length] for index in range(len(thai) - length + 1))
    return terms


class InMemoryEvidenceStore:
    """Deterministic development retriever used by unit tests.

    Production switches this port to Qdrant while keeping the same evidence
    contract. This avoids exposing raw vector scores directly to the agent.
    """

    def __init__(self) -> None:
        self._documents: dict[str, list[KnowledgeDocument]] = defaultdict(list)

    def upsert(self, documents: list[KnowledgeDocument]) -> None:
        for document in documents:
            site_documents = self._documents[document.site_id]
            site_documents[:] = [item for item in site_documents if item.id != document.id]
            site_documents.append(document)

    def search(self, site_id: str, query: str, limit: int = 4) -> list[tuple[KnowledgeDocument, float]]:
        query_terms = _terms(query)
        if not query_terms:
            return []
        ranked: list[tuple[KnowledgeDocument, float]] = []
        for document in self._documents.get(site_id, []):
            if not document.verified:
                continue
            text = f"{document.title} {document.content}".lower()
            matches = sum(1 for term in query_terms if term in text)
            score = matches / len(query_terms)
            if score > 0:
                ranked.append((document, score))
        return sorted(ranked, key=lambda item: item[1], reverse=True)[:limit]
