'use strict';
function bounded(value, fallback, min, max) { const n = parseInt(value, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function selectTools(tools, message) {
    const text = String(message || '').toLowerCase();
    const names = new Set();
    if (/(พาไป|เปิด|เลื่อน|หา|ค้น|navigate|open|find|scroll)/u.test(text)) names.add('trigger_scroller');
    if (/(เจ้าหน้าที่|พนักงาน|คนจริง|ร้องเรียน|staff|human|complaint)/u.test(text)) names.add('handoff_to_human');
    if (/(คำนวณ|รวม|เท่า|ราคา|ต่าง|ลด|กี่|calculate|total|price|cost|discount|difference|\d\s*[+*/-])/u.test(text)) names.add('calculate');
    if (/(สินค้า|ราคา|เปรียบ|รุ่น|หา|ค้น|stock|product|search|compare|find|price)/u.test(text)) names.add('search_website');
    if (/(เปรียบ|ต่าง|เทียบ|compare|difference|versus|\bvs\b)/u.test(text)) { names.add('search_website'); names.add('compare_products'); }
    // Keep the read-only lookup available for less predictable site requests.
    if (!names.size && text.length > 20) names.add('search_website');
    return tools.filter(tool => names.has(tool.name));
}
function createTokenBudget(options = {}) {
    return { remainingOutput: bounded(process.env.AI_MAX_OUTPUT_TOKENS_PER_REQUEST, 1800, 256, 8192),
        perCall: bounded(options.maxTokens ?? process.env.AI_MAX_OUTPUT_TOKENS, 600, 128, 2048),
        reservedOutput: 0, estimatedInput: 0, calls: 0 };
}
function reserveCall(budget, payload) {
    if (budget.remainingOutput < 128) throw new Error('Agent output token budget exhausted');
    const maxTokens = Math.min(budget.perCall, budget.remainingOutput);
    budget.remainingOutput -= maxTokens; budget.reservedOutput += maxTokens; budget.calls++;
    // An estimate for visibility only; provider billing depends on its tokenizer.
    budget.estimatedInput += Math.ceil(Buffer.byteLength(JSON.stringify({ system: payload.system, messages: payload.messages }), 'utf8') / 3);
    return maxTokens;
}
module.exports = { selectTools, createTokenBudget, reserveCall };
