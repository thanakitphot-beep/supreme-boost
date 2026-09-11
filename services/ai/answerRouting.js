// Route language tasks to reasoning; keep explicit navigation in the resolver.
// This selects a capability, never supplies a canned factual answer.
function needsAnswerReasoning(prompt, intent, result) {
    if (result?.status === 'blocked' || ['handoff', 'complaint'].includes(intent)) return false;
    const text = String(prompt || '').normalize('NFC').toLowerCase();
    if (/(?:พาไป|ไปหน้า|เปิดหน้า|เลื่อนไป|ช่วยหา|ช่วยค้นหา|^หา|^ค้นหา)|\b(?:find|navigate|open|scroll|take me|go to)\b/u.test(text)) return false;
    if (['summarize', 'define_term'].includes(intent)) return true;
    if (/(?:เปรียบเทียบ|ต่างกัน|ต่างระหว่าง|คำนวณ|รวม.*ส่ง|ทั้งหมด|อธิบาย|ทำไม|อย่างไร|ยังไง|กี่|เท่าไร|เท่าไหร่|ไหม|หรือไม่|แบบไหน|อันไหน|อันนั้น|ใบที่|แล้ว.*หนัก)|\b(?:compare|difference|calculate|total|why|how|what|when|which)\b|[?？]/u.test(text)) return true;
    return intent === 'answer' && Array.isArray(result?.sources) && result.sources.length > 0;
}
module.exports = { needsAnswerReasoning };
