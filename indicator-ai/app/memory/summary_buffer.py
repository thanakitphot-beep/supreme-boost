from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from threading import RLock


@dataclass
class Turn:
    role: str
    text: str


@dataclass
class Conversation:
    summary: str = ""
    turns: list[Turn] = field(default_factory=list)
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class SummaryBufferMemory:
    """Tenant- and conversation-scoped memory for development.

    It stores preferences and dialogue context only. It is deliberately not a
    source of truth for product facts; those must come from catalog or RAG.
    Replace this implementation with a Postgres repository in production.
    """

    def __init__(
        self,
        max_turns: int = 8,
        storage_path: Path | None = None,
        retention: timedelta = timedelta(days=30),
    ) -> None:
        self._max_turns = max_turns
        self._conversations: dict[tuple[str, str], Conversation] = defaultdict(Conversation)
        self._storage_path = storage_path
        self._retention = retention
        self._lock = RLock()
        self._load()

    def _load(self) -> None:
        if self._storage_path is None:
            return
        try:
            raw = json.loads(self._storage_path.read_text(encoding="utf-8"))
            records = raw.get("conversations", []) if isinstance(raw, dict) else []
        except (OSError, ValueError, TypeError):
            return

        cutoff = datetime.now(timezone.utc) - self._retention
        for record in records if isinstance(records, list) else []:
            try:
                site_id = str(record["site_id"])[:120]
                conversation_id = str(record["conversation_id"])[:120]
                updated_at = datetime.fromisoformat(str(record["updated_at"]).replace("Z", "+00:00"))
                if not site_id or not conversation_id or updated_at < cutoff:
                    continue
                raw_turns = record.get("turns", [])
                turns = [
                    Turn(role=str(turn["role"])[:20], text=str(turn["text"])[:1000])
                    for turn in raw_turns[-self._max_turns :]
                    if isinstance(turn, dict) and turn.get("role") in {"user", "assistant"} and turn.get("text")
                ]
                self._conversations[(site_id, conversation_id)] = Conversation(
                    summary=str(record.get("summary", ""))[-1000:], turns=turns, updated_at=updated_at
                )
            except (KeyError, TypeError, ValueError):
                continue

    def _persist(self) -> None:
        if self._storage_path is None:
            return
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        cutoff = datetime.now(timezone.utc) - self._retention
        records = []
        for (site_id, conversation_id), conversation in self._conversations.items():
            if conversation.updated_at < cutoff:
                continue
            records.append(
                {
                    "site_id": site_id,
                    "conversation_id": conversation_id,
                    "summary": conversation.summary[-1000:],
                    "updated_at": conversation.updated_at.isoformat(),
                    "turns": [{"role": turn.role, "text": turn.text[:1000]} for turn in conversation.turns[-self._max_turns :]],
                }
            )
        records.sort(key=lambda record: record["updated_at"], reverse=True)
        # Bound the local development file; production uses Postgres with an
        # equivalent TTL and tenant-scoped retention policy.
        payload = {"version": 1, "conversations": records[:500]}
        # A fixed sibling temporary file is sufficient while this local store
        # is protected by the in-process lock.  It also avoids Windows Python
        # manager builds that can stall while generating NamedTemporaryFile
        # names in a redirected development environment.
        temporary_path = self._storage_path.with_name(f"{self._storage_path.name}.tmp")
        temporary_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temporary_path.replace(self._storage_path)

    def context(self, site_id: str, conversation_id: str) -> str:
        with self._lock:
            conversation = self._conversations[(site_id, conversation_id)]
            recent = " | ".join(f"{turn.role}: {turn.text}" for turn in conversation.turns[-self._max_turns :])
            return " | ".join(part for part in [conversation.summary, recent] if part)

    def append(self, site_id: str, conversation_id: str, role: str, text: str) -> str:
        with self._lock:
            conversation = self._conversations[(site_id, conversation_id)]
            conversation.turns.append(Turn(role=role, text=text[:1000]))
            if len(conversation.turns) > self._max_turns:
                old_turns = conversation.turns[:-self._max_turns]
                compact = " | ".join(f"{turn.role}: {turn.text}" for turn in old_turns)
                conversation.summary = (f"{conversation.summary} | {compact}").strip(" | ")[-1000:]
                conversation.turns = conversation.turns[-self._max_turns :]
            conversation.updated_at = datetime.now(timezone.utc)
            self._persist()
            return conversation.summary

    def forget(self, site_id: str, conversation_id: str) -> bool:
        """Delete one visitor-scoped conversation without touching other users."""

        with self._lock:
            removed = self._conversations.pop((site_id, conversation_id), None) is not None
            if removed:
                self._persist()
            return removed
