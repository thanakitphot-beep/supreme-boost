from app.domain.schemas import AnswerStatus, ChatResponse


def enforce_grounding(response: ChatResponse) -> ChatResponse:
    """Fail closed: factual grounded replies require at least one citation.

    ``CONVERSATIONAL`` is an explicit allow-list status for greetings and
    courtesy phrases only; it is never presented as a sourced fact.
    """

    if response.status == AnswerStatus.GROUNDED and not response.citations:
        return ChatResponse(
            answer="ยังไม่มีข้อมูลที่ยืนยันได้เพียงพอให้ตอบอย่างถูกต้องครับ",
            status=AnswerStatus.INSUFFICIENT_EVIDENCE,
            grounded=False,
            confidence=0.0,
            conversation_summary=response.conversation_summary,
        )
    if response.status != AnswerStatus.GROUNDED:
        response.grounded = False
        response.action.type = "none"
        response.action.url = None
    return response
