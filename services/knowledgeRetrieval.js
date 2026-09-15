'use strict';

// Local retrieval over owner-uploaded knowledge. No embedding/model calls are
// needed, and tenant selection always precedes ranking or prompt construction.
const { maskPII } = require('./safety');

const MAX_SCAN = 1000;
const MAX_CONTEXT = 6000;
const MAX_SNIPPET = 1000;
const MAX_RESULTS = 5;
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const STOP_WORDS = new Set(('ช่วย ขอ อยาก ต้องการ ทราบ รู้ บอก ตอบ คำถาม หน่อย ครับ ค่ะ คะ นะ จ้า จ๊ะ ไหม มั้ย มั๊ย ไง อย่างไร อะไร ไหน เท่าไร เท่าไหร่ ทำไม เมื่อไร หรือ หรือไม่ ได้ ไม่ มี เป็น คือ ให้ กับ ของ ที่ ใน และ แต่ ถ้า แล้ว อีก นี้ นั้น มัน เรา ผม ฉัน คุณ ทาง เรื่อง ข้อมูล รายละเอียด เกี่ยว เกี่ยวกับ สินค้า บริการ ร้าน บริษัท เว็บไซต์ แพ็กเกจ the a an is are of to for and or can could would should please tell me my i you your it this that how what which do does about information').split(' '));
const TOPICS = [
    ['price', 'ราคา', 'ค่าใช้จ่าย', 'ค่าบริการ', 'แพง', 'ถูกกว่า', 'ราคาถูก', 'งบ', 'งบประมาณ', 'cost', 'pricing', 'price', 'budget'],
    ['shipping', 'จัดส่ง', 'ส่งของ', 'ค่าส่ง', 'ค่าจัดส่ง', 'ส่งฟรี', 'ส่งถึง', 'shipping', 'delivery', 'postage'],
    ['returns', 'คืนสินค้า', 'ขอคืน', 'คืนเงิน', 'เปลี่ยนสินค้า', 'refund', 'returns', 'return policy'],
    ['hours', 'เวลาทำการ', 'เวลาเปิด', 'เปิดกี่โมง', 'ปิดกี่โมง', 'เปิดร้าน', 'วันหยุด', 'opening hours', 'business hours', 'hours'],
    ['contact', 'ติดต่อ', 'เจ้าหน้าที่', 'สอบถาม', 'contact', 'support'],
    ['payment', 'ชำระเงิน', 'จ่ายเงิน', 'โอนเงิน', 'payment', 'payments'],
    ['cancel', 'ยกเลิก', 'cancel', 'cancellation'],
    ['stock', 'สต๊อก', 'สต็อก', 'ของหมด', 'มีของ', 'พร้อมส่ง', 'stock', 'availability']
];
const EXCLUDED_STATUSES = new Set(['pending', 'needs_review', 'conflicted', 'superseded', 'rejected', 'draft']);

function normalize(value, max = 20000) {
    return String(value || '').slice(0, max).normalize('NFC').toLocaleLowerCase('th-TH').replace(/\s+/gu, ' ').trim();
}

function words(text) {
    return new Set(Array.from(segmenter.segment(normalize(text)))
        .filter(part => part.isWordLike)
        .map(part => part.segment)
        .filter(word => word.length > 1 && !STOP_WORDS.has(word)));
}

function includesAlias(text, alias) {
    if (/[\u0E00-\u0E7F]/u.test(alias)) return text.includes(alias);
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text);
}

function topicIds(text) {
    return TOPICS.filter(([, ...aliases]) => aliases.some(alias => includesAlias(text, alias))).map(([id]) => id);
}

function rankKnowledgeChunks(chunks, query) {
    const queryText = normalize(query, 1200);
    const queryWords = words(queryText);
    const queryTopics = topicIds(queryText);
    if (!queryWords.size && !queryTopics.length) return [];
    const candidates = (Array.isArray(chunks) ? chunks : []).slice(0, MAX_SCAN)
        .filter(chunk => chunk && typeof chunk.content === 'string' && chunk.content.trim() && !EXCLUDED_STATUSES.has(chunk.status))
        .map(chunk => {
            const text = normalize(`${chunk.title || ''} ${chunk.content}`);
            return { chunk, text, tokens: words(text), title: normalize(chunk.title, 240) };
        });
    const frequencies = new Map([...queryWords].map(term => [term, candidates.filter(item => item.tokens.has(term)).length]));
    return candidates.map(item => {
        const matches = [...queryWords].filter(term => item.tokens.has(term));
        const matchedTopics = queryTopics.filter(id => {
            const [, ...aliases] = TOPICS.find(topic => topic[0] === id);
            return aliases.some(alias => includesAlias(item.text, alias));
        });
        if (!matches.length && !matchedTopics.length) return { ...item, score: 0, matchedTerms: [] };
        // Product/model names in English must match when asking for prices or
        // availability: a generic price page is not evidence for that product.
        const anchors = [...queryWords].filter(term => /[a-z]/i.test(term) && !TOPICS.some(([, ...aliases]) => aliases.some(alias => words(alias).has(term))));
        if (anchors.length && queryTopics.some(id => id === 'price' || id === 'stock') && !anchors.some(term => item.tokens.has(term))) {
            return { ...item, score: 0, matchedTerms: [] };
        }
        const score = matches.reduce((total, term) => total + 2 + Math.log(1 + candidates.length / (1 + frequencies.get(term))) + (words(item.title).has(term) ? 2 : 0), 0)
            + matchedTopics.length * 4
            + (queryText.length > 3 && item.text.includes(queryText) ? 8 : 0);
        return { chunk: item.chunk, score, matchedTerms: matches };
    }).filter(item => item.score > 0)
        .sort((left, right) => right.score - left.score || String(right.chunk.created_at || '').localeCompare(String(left.chunk.created_at || '')));
}

function publicSourceUrl(value) {
    try {
        const url = new URL(String(value || ''));
        if (!/^https?:$/u.test(url.protocol) || url.username || url.password) return null;
        return `${url.origin}${url.pathname}`.slice(0, 300);
    } catch (_) { return null; }
}

function formatKnowledgeContext(ranked) {
    const output = [];
    const seen = new Set();
    let size = 0;
    for (const item of ranked) {
        const content = maskPII(String(item.chunk.content).replace(/\s+/gu, ' ').trim()).slice(0, 20000);
        const identity = normalize(content);
        if (seen.has(identity)) continue;
        seen.add(identity);
        const firstHit = (item.matchedTerms || []).map(term => normalize(content).indexOf(term)).filter(index => index >= 0).sort((a, b) => a - b)[0] || 0;
        const start = Math.max(0, firstHit - 160);
        const excerpt = `${start ? '…' : ''}${content.slice(start, start + MAX_SNIPPET)}${content.length > start + MAX_SNIPPET ? '…' : ''}`;
        // JSON encoding keeps document newlines and source labels inside data.
        const line = `[KNOWLEDGE_SOURCE] ${JSON.stringify({
            title: maskPII(String(item.chunk.title || 'Owner supplied knowledge')).slice(0, 160),
            url: publicSourceUrl(item.chunk.url),
            excerpt
        })}`;
        const needed = line.length + (output.length ? 2 : 0);
        if (size + needed > MAX_CONTEXT) continue;
        output.push(line);
        size += needed;
        if (output.length >= MAX_RESULTS) break;
    }
    return output.join('\n\n');
}

async function retrieveTenantKnowledge(db, tenantId, query) {
    if (!db || typeof tenantId !== 'string' || !tenantId || tenantId === 'demo' || !String(query || '').trim()) return '';
    let cursor = db.collection('knowledge_chunks').find({ tenant_id: tenantId });
    if (typeof cursor.project === 'function') cursor = cursor.project({ tenant_id: 1, title: 1, content: 1, url: 1, status: 1, created_at: 1 });
    if (typeof cursor.maxTimeMS === 'function') cursor = cursor.maxTimeMS(1500);
    const chunks = await cursor.sort({ created_at: -1 }).limit(MAX_SCAN).toArray();
    // Enforce isolation again even if an adapter returns an unexpected row.
    const scoped = chunks.filter(chunk => chunk && chunk.tenant_id === tenantId);
    return formatKnowledgeContext(rankKnowledgeChunks(scoped, query));
}

module.exports = { retrieveTenantKnowledge, rankKnowledgeChunks, formatKnowledgeContext };
