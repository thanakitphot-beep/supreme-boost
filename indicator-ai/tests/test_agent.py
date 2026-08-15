from app.agent.service import GroundedChatService
from app.domain.schemas import AnswerStatus, CatalogItem, ChatRequest, ConversationTurn, KnowledgeDocument
from app.memory.summary_buffer import SummaryBufferMemory
from app.rag.evidence_store import InMemoryEvidenceStore
from pathlib import Path


def make_service() -> tuple[GroundedChatService, InMemoryEvidenceStore]:
    evidence = InMemoryEvidenceStore()
    return GroundedChatService(evidence, SummaryBufferMemory()), evidence


def test_recommendation_is_grounded_and_never_navigates() -> None:
    service, _ = make_service()
    response = service.respond(
        ChatRequest(
            site_id="megastore",
            conversation_id="conversation-1",
            message="ร้านนี้มีอะไรแนะนำบ้าง",
            catalog=[CatalogItem(id="shoe-1", name="รองเท้าวิ่ง Sprint", price=2490, url="/products/sprint")],
        )
    )
    assert response.status == AnswerStatus.GROUNDED
    assert response.citations[0].source_id == "shoe-1"
    assert response.action.type == "none"


def test_unknown_availability_fails_closed() -> None:
    service, _ = make_service()
    response = service.respond(
        ChatRequest(site_id="megastore", conversation_id="conversation-1", message="ร้านนี้มีต้นไม้ไหม")
    )
    assert response.status == AnswerStatus.INSUFFICIENT_EVIDENCE
    assert response.grounded is False
    assert not response.citations


def test_safe_small_talk_does_not_require_rag_evidence() -> None:
    service, _ = make_service()
    response = service.respond(
        ChatRequest(site_id="megastore", conversation_id="conversation-1", message="สวัสดี")
    )
    assert response.status == AnswerStatus.CONVERSATIONAL
    assert response.grounded is False
    assert not response.citations
    assert "สวัสดี" in response.answer


def test_product_follow_up_uses_known_catalog_context_not_homepage_text() -> None:
    service, evidence = make_service()
    evidence.upsert(
        [
            KnowledgeDocument(
                id="home", site_id="megastore", title="MegaStore", source_url="/",
                content="หน้าแรกของร้าน มีสินค้าหลากหลายรายการ", verified=True,
            )
        ]
    )
    shoe = CatalogItem(
        id="nike-air", name="รองเท้าวิ่ง Nike Air",
        description="Air Max Cushioning รุ่นล่าสุด สำหรับการวิ่ง", price=2790, in_stock=True,
        url="/products/nike-air",
    )
    response = service.respond(
        ChatRequest(
            site_id="megastore", conversation_id="conversation-1", message="มันใส่สบายแค่ไหน",
            catalog=[shoe],
            history=[ConversationTurn(role="assistant", text="พบ รองเท้าวิ่ง Nike Air ราคา 2,790 บาทครับ")],
        )
    )
    assert response.status == AnswerStatus.GROUNDED
    assert response.citations[0].source_id == "nike-air"
    assert "Air Max Cushioning" in response.answer
    assert "ยังไม่มีข้อมูลยืนยันระดับความนุ่ม" in response.answer


def test_catalog_finds_a_product_name_inside_a_natural_request() -> None:
    service, _ = make_service()
    response = service.respond(
        ChatRequest(
            site_id="megastore", conversation_id="conversation-1",
            message="ช่วยหารองเท้าวิ่ง Nike Air ให้หน่อย",
            catalog=[CatalogItem(id="nike-air", name="รองเท้าวิ่ง Nike Air", price=2790, url="/products/nike-air")],
        )
    )
    assert response.status == AnswerStatus.GROUNDED
    assert response.citations[0].source_id == "nike-air"


def test_availability_search_warps_to_a_published_catalog_item() -> None:
    service, _ = make_service()
    response = service.respond(
        ChatRequest(
            site_id="megastore", conversation_id="conversation-1", message="มีลำโพงขายไหม",
            catalog=[CatalogItem(id="speaker", name="ลำโพง Bluetooth พกพา", price=1990, url="/products/speaker")],
        )
    )
    assert response.status == AnswerStatus.GROUNDED
    assert response.citations[0].source_id == "speaker"
    assert response.action.type == "warp"
    assert response.action.target_text == "ลำโพง Bluetooth พกพา"


def test_persistent_memory_restores_product_context_after_service_restart() -> None:
    shoe = CatalogItem(
        id="nike-air", name="รองเท้าวิ่ง Nike Air",
        description="Air Max Cushioning รุ่นล่าสุด สำหรับการวิ่ง", price=2790, url="/products/nike-air",
    )
    test_data_dir = Path(__file__).parent.parent / "data"
    test_data_dir.mkdir(exist_ok=True)
    store_path = test_data_dir / "conversations-test.json"
    store_path.unlink(missing_ok=True)
    first_service = GroundedChatService(InMemoryEvidenceStore(), SummaryBufferMemory(storage_path=store_path))
    first_service.respond(
        ChatRequest(
            site_id="megastore", conversation_id="visitor-1", message="ช่วยหารองเท้าวิ่ง Nike Air ให้หน่อย", catalog=[shoe]
        )
    )
    restarted_service = GroundedChatService(InMemoryEvidenceStore(), SummaryBufferMemory(storage_path=store_path))
    response = restarted_service.respond(
        ChatRequest(site_id="megastore", conversation_id="visitor-1", message="มันใส่สบายแค่ไหน", catalog=[shoe])
    )
    store_path.unlink(missing_ok=True)
    assert response.status == AnswerStatus.GROUNDED
    assert response.citations[0].source_id == "nike-air"


def test_ambiguous_product_pronoun_fails_closed_instead_of_summarizing_homepage() -> None:
    service, evidence = make_service()
    evidence.upsert(
        [KnowledgeDocument(id="home", site_id="megastore", title="MegaStore", source_url="/", content="สินค้า หน้าแรก", verified=True)]
    )
    response = service.respond(
        ChatRequest(site_id="megastore", conversation_id="new", message="มันใส่สบายแค่ไหน")
    )
    assert response.status == AnswerStatus.INSUFFICIENT_EVIDENCE
    assert "สินค้าชิ้นไหน" in response.answer


def test_rag_answer_contains_a_verified_source() -> None:
    service, evidence = make_service()
    evidence.upsert(
        [
            KnowledgeDocument(
                id="shipping", site_id="megastore", title="การจัดส่ง", source_url="/shipping",
                content="ร้านจัดส่งภายใน 1-3 วันทำการ", verified=True,
            )
        ]
    )
    response = service.respond(
        ChatRequest(site_id="megastore", conversation_id="conversation-1", message="จัดส่งกี่วัน")
    )
    assert response.status == AnswerStatus.GROUNDED
    assert response.citations[0].source_id == "shipping"


def test_colloquial_package_spelling_returns_published_plan_summary() -> None:
    service, evidence = make_service()
    evidence.upsert(
        [
            KnowledgeDocument(
                id="indicator-home", site_id="indicator", title="INDICATOR WEB CHAT", source_url="/",
                content=(
                    "ระบบช่วยตอบคำถามสำหรับเว็บไซต์ แพ็กเกจการลงทุน "
                    "Starter ฿990/เดือน สำหรับเว็บไซต์ขนาดเล็ก "
                    "Pro Matrix ฿2,490/เดือน พร้อม Telekinesis Warp "
                    "Enterprise ติดต่อเรา สำหรับองค์กร"
                ),
                verified=True,
            )
        ]
    )
    response = service.respond(
        ChatRequest(site_id="indicator", conversation_id="conversation-1", message="มีแพคเกจอะไรบ้าง")
    )
    assert response.status == AnswerStatus.GROUNDED
    assert "Starter ฿990/เดือน" in response.answer
    assert "Pro Matrix ฿2,490/เดือน" in response.answer
    assert "Enterprise ติดต่อเรา" in response.answer
    assert response.action.type == "warp"
