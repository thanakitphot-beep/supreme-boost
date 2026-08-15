from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

from fastapi import FastAPI, Request, Response, status

from app.agent.service import GroundedChatService
from app.core.config import get_settings
from app.domain.schemas import ChatRequest, ChatResponse, IngestRequest, IngestResponse
from app.memory.summary_buffer import SummaryBufferMemory
from app.rag.evidence_store import InMemoryEvidenceStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.evidence_store = InMemoryEvidenceStore()
    app.state.memory = SummaryBufferMemory(
        storage_path=Path(settings.conversation_store_path),
        retention=timedelta(hours=settings.conversation_ttl_hours),
    )
    app.state.agent = GroundedChatService(app.state.evidence_store, app.state.memory)
    yield


app = FastAPI(
    title="INDICATOR Intelligence Service",
    version="0.1.0",
    description="Evidence-first RAG service. No citation means no factual answer.",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "healthy", "rag_backend": settings.rag_backend, "mode": "evidence-first"}


@app.post("/v1/knowledge/documents", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_documents(payload: IngestRequest, request: Request) -> IngestResponse:
    # The development store is deterministic. A production worker will validate,
    # chunk, embed, and upsert verified documents into Qdrant asynchronously.
    request.app.state.evidence_store.upsert(payload.documents)
    return IngestResponse(accepted=len(payload.documents))


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request) -> ChatResponse:
    return request.app.state.agent.respond(payload)


@app.delete("/v1/conversations/{site_id}/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def forget_conversation(site_id: str, conversation_id: str, request: Request) -> Response:
    """Privacy control for deleting one browser-scoped conversation."""

    request.app.state.memory.forget(site_id, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
