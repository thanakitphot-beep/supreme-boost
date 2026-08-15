"""Qdrant repository port used after an approved embedding model is configured.

The production implementation must always filter by site_id before retrieval.
It intentionally accepts vectors from a separate embedding provider so model
selection never leaks into the web-facing API.
"""

from app.domain.schemas import KnowledgeDocument


class QdrantEvidenceStore:
    def __init__(self, *, url: str, collection: str, dimensions: int) -> None:
        try:
            from qdrant_client import QdrantClient
        except ModuleNotFoundError as error:  # pragma: no cover - dependency is installed in deployment
            raise RuntimeError("Install qdrant-client to enable INDICATOR_RAG_BACKEND=qdrant") from error
        self._client = QdrantClient(url=url)
        self._collection = collection
        self._dimensions = dimensions

    def ensure_collection(self) -> None:
        from qdrant_client import models

        if not self._client.collection_exists(self._collection):
            self._client.create_collection(
                collection_name=self._collection,
                vectors_config=models.VectorParams(size=self._dimensions, distance=models.Distance.COSINE),
            )
            self._client.create_payload_index(
                collection_name=self._collection,
                field_name="site_id",
                field_schema=models.PayloadSchemaType.KEYWORD,
            )

    def upsert(self, documents: list[KnowledgeDocument], vectors: list[list[float]]) -> None:
        """Persist pre-computed embeddings with source provenance.

        The ingestion worker supplies vectors. The chat path never writes to
        Qdrant, preventing a customer message from becoming knowledge.
        """
        from qdrant_client import models

        if len(documents) != len(vectors):
            raise ValueError("Each document requires exactly one embedding")
        self.ensure_collection()
        points = [
            models.PointStruct(
                id=document.id,
                vector=vector,
                payload={
                    "site_id": document.site_id,
                    "title": document.title,
                    "content": document.content,
                    "source_url": document.source_url,
                    "source_kind": document.source_kind.value,
                    "verified": document.verified,
                },
            )
            for document, vector in zip(documents, vectors, strict=True)
        ]
        self._client.upsert(collection_name=self._collection, points=points, wait=True)
