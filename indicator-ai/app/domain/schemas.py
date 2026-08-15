from datetime import datetime, timezone
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class SourceKind(StrEnum):
    CATALOG = "catalog"
    POLICY = "policy"
    PUBLIC_PAGE = "public_page"
    EXTERNAL_RESEARCH = "external_research"


class AnswerStatus(StrEnum):
    GROUNDED = "grounded"
    # Small talk is deliberately separate from factual answers.  It has no
    # external claim, so requiring a catalogue/RAG citation makes greetings
    # feel broken without improving safety.
    CONVERSATIONAL = "conversational"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    BLOCKED = "blocked"
    HANDOFF = "handoff"


class CatalogItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=1500)
    price: int | float | None = Field(default=None, ge=0)
    in_stock: bool | None = None
    url: str = Field(default="/", max_length=500)
    keywords: list[str] = Field(default_factory=list, max_length=24)


class KnowledgeDocument(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=120)
    site_id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=240)
    content: str = Field(min_length=1, max_length=12_000)
    source_url: str = Field(min_length=1, max_length=500)
    source_kind: SourceKind = SourceKind.PUBLIC_PAGE
    published_at: datetime | None = None
    verified: bool = True


class Citation(BaseModel):
    source_id: str
    source_kind: SourceKind
    title: str
    url: str
    excerpt: str = Field(max_length=600)
    score: float = Field(ge=0, le=1)


class SafeAction(BaseModel):
    type: Literal["navigate", "warp", "none"] = "none"
    url: str | None = None
    target_text: str | None = Field(default=None, max_length=240)
    confirmation_required: bool = False


class ConversationTurn(BaseModel):
    """Untrusted dialogue context used only to resolve references.

    A turn can identify which catalog record a visitor means, but it is never
    evidence for a product fact or a source that can be cited.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=1000)


class ChatRequest(BaseModel):
    """Only public, tenant-scoped context may enter the intelligence service."""

    model_config = ConfigDict(str_strip_whitespace=True)

    site_id: str = Field(min_length=1, max_length=120)
    conversation_id: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=1200)
    locale: str = Field(default="th", max_length=12)
    catalog: list[CatalogItem] = Field(default_factory=list, max_length=100)
    history: list[ConversationTurn] = Field(default_factory=list, max_length=8)

    @field_validator("message")
    @classmethod
    def reject_control_characters(cls, value: str) -> str:
        return "".join(char for char in value if char.isprintable()).strip()


class ChatResponse(BaseModel):
    answer: str = Field(min_length=1, max_length=1600)
    status: AnswerStatus
    grounded: bool
    confidence: float = Field(ge=0, le=1)
    citations: list[Citation] = Field(default_factory=list)
    action: SafeAction = Field(default_factory=SafeAction)
    conversation_summary: str = Field(default="", max_length=1000)
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class IngestRequest(BaseModel):
    documents: list[KnowledgeDocument] = Field(min_length=1, max_length=100)


class IngestResponse(BaseModel):
    accepted: int
    rejected: int = 0
