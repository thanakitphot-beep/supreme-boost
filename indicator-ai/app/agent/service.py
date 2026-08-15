import re
from typing import TypedDict

from app.domain.schemas import (
    AnswerStatus,
    CatalogItem,
    ChatRequest,
    ChatResponse,
    Citation,
    SafeAction,
    SourceKind,
)
from app.guardrails.grounding import enforce_grounding
from app.memory.summary_buffer import SummaryBufferMemory
from app.rag.evidence_store import InMemoryEvidenceStore
from app.understanding.language import package_summary, relevant_excerpt
from app.tools.catalog import (
    CONTEXT_PRODUCT_PREFIX,
    CatalogTool,
    availability_subject,
    is_context_marker,
    is_recommendation,
    normalize,
)

try:  # The fallback keeps source-only checks usable before dependencies install.
    from langgraph.graph import END, START, StateGraph
except ModuleNotFoundError:  # pragma: no cover
    END = START = None
    StateGraph = None


class AgentState(TypedDict, total=False):
    request: ChatRequest
    memory_context: str
    catalog_matches: list[CatalogItem]
    evidence: list[tuple[object, float]]
    response: ChatResponse


def conversational_reply(message: str) -> str | None:
    """Answer only a small allow-list of non-factual social messages.

    This must stay intentionally narrow.  Questions about a store, product,
    policy, price, or the outside world continue through retrieval and the
    grounding guardrail.
    """

    compact = re.sub(r"[\s.!！?？]+", "", message.casefold())
    greetings = {
        "สวัสดี", "สวัสดีครับ", "สวัสดีค่ะ", "หวัดดี", "หวัดดีครับ", "หวัดดีค่ะ",
        "hello", "hi", "hey",
    }
    if compact in greetings:
        return "สวัสดีครับ ผมคือ INDICATOR Assistant มีอะไรให้ช่วยค้นหาหรืออธิบายไหมครับ"

    if compact in {"ขอบคุณ", "ขอบคุณครับ", "ขอบคุณค่ะ", "thanks", "thankyou"}:
        return "ยินดีครับ ถ้ามีอะไรให้ช่วยต่อ บอกผมได้เลยครับ"

    if compact in {"คุณคือใคร", "ชื่ออะไร", "ทำอะไรได้บ้าง", "whoareyou", "whatcanyoudo"}:
        return (
            "ผมคือ INDICATOR Assistant ช่วยค้นหาข้อมูลในเว็บไซต์ อธิบายจากแหล่งอ้างอิง "
            "และพาไปยังหน้าที่เกี่ยวข้องได้ครับ"
        )
    return None


FOLLOW_UP_REFERENCE = re.compile(r"(?:มัน|อันนี้|ตัวนี้|สินค้านี้|รายการนี้|รุ่นนี้|เมื่อกี้|ก่อนหน้า)")
PRODUCT_DETAIL = re.compile(
    r"(?:ใส่สบาย|นุ่ม|รองรับแรงกระแทก|ทน|คุณภาพ|รีวิว|สเปก|เหมาะกับ|ราคา|กี่บาท|เท่าไหร่|สต็อก|มีสินค้า|หมด|comfort|cushion|durab|review|spec|quality)",
    re.IGNORECASE,
)


def is_follow_up_product_question(message: str) -> bool:
    return bool(FOLLOW_UP_REFERENCE.search(message) or PRODUCT_DETAIL.search(message))


def _catalog_products(catalog: list[CatalogItem]) -> list[CatalogItem]:
    """Return canonical catalog records, de-duplicated in favour of detail."""

    best_by_name: dict[str, CatalogItem] = {}
    for item in catalog:
        if is_context_marker(item):
            continue
        key = normalize(item.name)
        if not key:
            continue
        old = best_by_name.get(key)
        # Prefer authoritative entries with a richer description, then stock
        # and price data, over a visible-card placeholder.
        if old is None or (
            len(item.description) + int(item.in_stock is not None) + int(item.price is not None)
            > len(old.description) + int(old.in_stock is not None) + int(old.price is not None)
        ):
            best_by_name[key] = item
    return list(best_by_name.values())


def contextual_product(request: ChatRequest, memory_context: str) -> CatalogItem | None:
    """Resolve pronouns to a known catalog record, never to chat text alone."""

    context_texts: list[str] = []
    # Explicit bridge history is preferred after a service restart.
    context_texts.extend(turn.text for turn in reversed(request.history) if turn.role == "assistant")
    # This compatibility marker lets a newly built widget pass context through
    # an already-running Node bridge until that bridge is restarted.
    context_texts.extend(
        item.name[len(CONTEXT_PRODUCT_PREFIX) :]
        for item in request.catalog
        if is_context_marker(item)
    )
    if memory_context:
        context_texts.append(memory_context)

    products = sorted(_catalog_products(request.catalog), key=lambda item: len(normalize(item.name)), reverse=True)
    for text in context_texts:
        compact = normalize(text)
        for product in products:
            name = normalize(product.name)
            if len(name) >= 4 and name in compact:
                return product
    return None


class GroundedChatService:
    """A small, auditable agent.

    The model is intentionally not allowed to answer before retrieval. This
    deterministic v1 composes evidence directly; an optional local model can
    be added later only inside the compose node and must emit the same schema.
    """

    def __init__(self, evidence_store: InMemoryEvidenceStore, memory: SummaryBufferMemory) -> None:
        self._evidence_store = evidence_store
        self._memory = memory
        self._graph = self._build_graph()

    def _build_graph(self):
        if StateGraph is None:
            return None
        graph = StateGraph(AgentState)
        graph.add_node("retrieve_catalog", self._retrieve_catalog)
        graph.add_node("retrieve_evidence", self._retrieve_evidence)
        graph.add_node("compose", self._compose)
        graph.add_edge(START, "retrieve_catalog")
        graph.add_edge("retrieve_catalog", "retrieve_evidence")
        graph.add_edge("retrieve_evidence", "compose")
        graph.add_edge("compose", END)
        return graph.compile()

    def respond(self, request: ChatRequest) -> ChatResponse:
        initial: AgentState = {
            "request": request,
            "memory_context": self._memory.context(request.site_id, request.conversation_id),
        }
        if self._graph is not None:
            state = self._graph.invoke(initial)
        else:  # Development fallback; production uses the same three nodes in LangGraph.
            state = self._compose(self._retrieve_evidence(self._retrieve_catalog(initial)))
        response = enforce_grounding(state["response"])
        self._memory.append(request.site_id, request.conversation_id, "user", request.message)
        summary = self._memory.append(request.site_id, request.conversation_id, "assistant", response.answer)
        response.conversation_summary = summary
        return response

    def _retrieve_catalog(self, state: AgentState) -> AgentState:
        request = state["request"]
        matches = CatalogTool.search(request.catalog, request.message)
        if is_recommendation(request.message):
            matches = CatalogTool.recommend(request.catalog)
        return {**state, "catalog_matches": matches}

    def _retrieve_evidence(self, state: AgentState) -> AgentState:
        request = state["request"]
        return {**state, "evidence": self._evidence_store.search(request.site_id, request.message)}

    def _catalog_citations(self, products: list[CatalogItem]) -> list[Citation]:
        return [
            Citation(
                source_id=item.id,
                source_kind=SourceKind.CATALOG,
                title=item.name,
                url=item.url,
                excerpt=item.description or item.name,
                score=1.0,
            )
            for item in products
        ]

    def _product_detail_response(self, item: CatalogItem, message: str) -> ChatResponse:
        """Answer a product follow-up from its catalog entry without guessing."""

        price = f"ราคา {item.price:,.0f} บาท" if item.price is not None else "ร้านยังไม่ระบุราคา"
        stock = "มีสินค้า" if item.in_stock is True else "สินค้าหมด" if item.in_stock is False else "ร้านยังไม่ยืนยันสต็อก"
        detail = item.description.strip()
        normalized_message = message.casefold()

        if re.search(r"(?:ราคา|กี่บาท|เท่าไหร่)", normalized_message):
            answer = f"{item.name} {price} ครับ"
        elif re.search(r"(?:สต็อก|มีสินค้า|หมด)", normalized_message):
            answer = f"{item.name}: {stock} ครับ"
        elif re.search(r"(?:ใส่สบาย|นุ่ม|รองรับแรงกระแทก|comfort|cushion)", normalized_message):
            known = f"ข้อมูลร้านระบุว่า {detail}" if detail else "ร้านยังไม่มีรายละเอียดคุณสมบัติของรุ่นนี้"
            answer = (
                f"สำหรับ {item.name}: {known} ครับ แต่ยังไม่มีข้อมูลยืนยันระดับความนุ่ม "
                "หรือความสบายเมื่อใส่นาน ๆ จึงตอบเกินข้อมูลนี้ไม่ได้ครับ"
            )
        else:
            known = detail or "ร้านยังไม่มีรายละเอียดเพิ่มเติมของรุ่นนี้"
            answer = f"ตอนนี้กำลังพูดถึง {item.name} ครับ ข้อมูลที่ยืนยันได้คือ {known} ({price}; {stock})"

        return ChatResponse(
            answer=answer,
            status=AnswerStatus.GROUNDED,
            grounded=True,
            confidence=1.0,
            citations=self._catalog_citations([item]),
            action=SafeAction(type="none"),
        )

    def _compose(self, state: AgentState) -> AgentState:
        request = state["request"]
        small_talk = conversational_reply(request.message)
        if small_talk:
            return {
                **state,
                "response": ChatResponse(
                    answer=small_talk,
                    status=AnswerStatus.CONVERSATIONAL,
                    grounded=False,
                    confidence=1.0,
                    action=SafeAction(type="none"),
                ),
            }

        products = state.get("catalog_matches", [])
        referenced_product = contextual_product(request, state.get("memory_context", ""))
        if is_follow_up_product_question(request.message):
            if referenced_product:
                return {**state, "response": self._product_detail_response(referenced_product, request.message)}
            if FOLLOW_UP_REFERENCE.search(request.message):
                return {
                    **state,
                    "response": ChatResponse(
                        answer="ผมยังไม่ทราบว่าหมายถึงสินค้าชิ้นไหนครับ ลองบอกชื่อหรือรุ่นสินค้าอีกครั้งได้เลย",
                        status=AnswerStatus.INSUFFICIENT_EVIDENCE,
                        grounded=False,
                        confidence=0.0,
                    ),
                }

        if is_recommendation(request.message):
            if not products:
                response = ChatResponse(
                    answer="ยังไม่พบรายการสินค้าที่แนะนำได้จากข้อมูลร้านนี้ครับ",
                    status=AnswerStatus.INSUFFICIENT_EVIDENCE,
                    grounded=False,
                    confidence=0.0,
                )
            else:
                names = ", ".join(item.name for item in products)
                response = ChatResponse(
                    answer=f"ในร้านนี้มีรายการที่น่าสนใจ {len(products)} รายการ: {names}",
                    status=AnswerStatus.GROUNDED,
                    grounded=True,
                    confidence=1.0,
                    citations=self._catalog_citations(products),
                    # Recommendation must never navigate on behalf of a visitor.
                    action=SafeAction(type="none"),
                )
            return {**state, "response": response}

        if products:
            item = products[0]
            price = f" ราคา {item.price:,.0f} บาท" if item.price is not None else ""
            stock = "มีสินค้า" if item.in_stock is True else "สินค้าหมด" if item.in_stock is False else "พบข้อมูลในร้าน"
            response = ChatResponse(
                answer=f"พบ {item.name}{price} ({stock}) ครับ ผมพาไปที่รายการนี้ให้แล้ว",
                status=AnswerStatus.GROUNDED,
                grounded=True,
                confidence=1.0,
                citations=self._catalog_citations([item]),
                # Same-page warp is a reversible visual assist, not a
                # purchase or a sensitive action. The Node bridge validates
                # and translates it for the widget.
                action=SafeAction(type="warp", url=item.url, target_text=item.name),
            )
            return {**state, "response": response}

        evidence = state.get("evidence", [])
        if evidence:
            document, score = evidence[0]
            excerpt = relevant_excerpt(document.content, request.message)
            package_reply = package_summary(document.content, request.message)
            response = ChatResponse(
                answer=package_reply or f"จาก “{document.title}”: {excerpt}",
                status=AnswerStatus.GROUNDED,
                grounded=True,
                confidence=round(min(score, 0.95), 2),
                citations=[
                    Citation(
                        source_id=document.id,
                        source_kind=document.source_kind,
                        title=document.title,
                        url=document.source_url,
                        excerpt=excerpt,
                        score=round(min(score, 1.0), 2),
                    )
                ],
                action=SafeAction(type="warp", target_text="แพ็กเกจการลงทุน") if package_reply else SafeAction(type="none"),
            )
            return {**state, "response": response}

        subject = availability_subject(request.message)
        requested = f" “{subject}”" if subject else ""
        response = ChatResponse(
            answer=f"ยังไม่พบข้อมูลยืนยันเกี่ยวกับ{requested} ในข้อมูลที่อนุญาตให้ผมใช้ครับ",
            status=AnswerStatus.INSUFFICIENT_EVIDENCE,
            grounded=False,
            confidence=0.0,
        )
        return {**state, "response": response}
