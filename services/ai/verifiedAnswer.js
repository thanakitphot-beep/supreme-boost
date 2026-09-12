'use strict';
const { calculate, records } = require('../tools/website');
const result = (reply, source) => ({ reply, action: null, interactive: null, cssCommand: '', status: 'ok', metadata: { provider: 'verified-local', source, modelCalls: 0 } });

// Deliberately narrow: answer exact arithmetic and explicit price comparisons
// from current structured facts without spending model tokens.
function verifiedAnswer(payload = {}) {
    const prompt = String(payload.prompt || '').trim();
    const arithmetic = prompt.match(/^(?:(?:คำนวณ|ช่วยคำนวณ|calculate)\s*)?([\d\s.+*/()%\-]+?)\s*(?:เท่ากับเท่าไหร่|เท่าไหร่|ได้เท่าไหร่|เท่ากับ|=|\?)?$/iu);
    if (arithmetic && /[+*/%\-]/.test(arithmetic[1])) {
        try { return result(`${arithmetic[1].trim()} = ${calculate(arithmetic[1]).toLocaleString('en-US', { maximumFractionDigits: 12 })}`, 'arithmetic'); } catch { return null; }
    }
    if (!/(ราคา|price|cost)/iu.test(prompt) || !/(ต่าง|เทียบ|compare|difference)/iu.test(prompt)) return null;
    const mentioned = records(payload).filter(item => prompt.toLowerCase().includes(item.title.toLowerCase()));
    if (mentioned.length !== 2 || mentioned.some(item => item.price === null)) return null;
    const [a, b] = mentioned;
    return result(`${a.title}: ${a.price.toLocaleString('en-US')} • ${b.title}: ${b.price.toLocaleString('en-US')} ต่างกัน ${Math.abs(a.price - b.price).toLocaleString('en-US')} ตามราคาที่แสดงบนหน้านี้`, 'current_page_prices');
}
module.exports = { verifiedAnswer };
