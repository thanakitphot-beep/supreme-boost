'use strict';

/**
 * INDICATOR's provider-independent agent core.
 *
 * This module intentionally makes no network call to a model provider. It
 * plans only the supported website-assistant tasks and validates every action
 * before returning the response the widget already understands.
 */

const fs = require('fs');
const path = require('path');
const { inferSiteIdentity } = require('./siteProfiles');
const { getSiteKnowledge } = require('./siteExpertise');
const { normalizeHumanText, fuzzyPhraseScore, productPhrases } = require('./languageUnderstanding');

const KNOWLEDGE_PATH = path.join(__dirname, '..', 'data', 'indicator-knowledge.json');
const MAX_PROMPT_CHARS = 1200;
const MAX_CONTEXT_MESSAGES = 8;
const PRIVATE_CONTEXT_PREFIX = '__indicator_context_product__:';
const PRODUCT_TERMS = ['กางเกง', 'รองเท้า', 'เสื้อ', 'กระเป๋า', 'หูฟัง', 'หนังสือ', 'นาฬิกา', 'โทรศัพท์', 'หมวก', 'ขวดน้ำ', 'เสื่อ', 'โต๊ะ', 'เก้าอี้', 'สินค้า', 'shoe', 'shoes', 'shirt', 'pants', 'shorts', 'bag', 'headphone', 'book', 'product'];
const PRODUCT_CUES = ['กางเกง', 'เสื้อ', 'รองเท้า', 'กระเป๋า', 'หูฟัง', 'หนังสือ', 'นาฬิกา', 'โทรศัพท์', 'หมวก', 'ขวดน้ำ', 'เสื่อ', 'โต๊ะ', 'เก้าอี้', 'shoe', 'shirt', 'bag', 'headphone', 'book', 'watch', 'phone'];
const REQUEST_FILLER = /(?:อยากได้|ต้องการ|ขอ|ช่วยหา|ช่วย|หาให้|แบบ|เอา|มีไหม|มีมั้ย|หน่อย|please|looking\s*for|\bneed\b|\bwant\b)/giu;
const PRODUCT_LIST_REQUEST = /(?:มี.*(?:อะไรบ้าง|แบบไหน|รุ่นไหน|ตัวไหน|ให้เลือก|ขาย|เหลือ)|พอจะมี|อะไรบ้าง|ทั้งหมด|รายการ|ตัวเลือก|แนะนำ.*(?:สินค้า|รุ่น)|show|list|all)/iu;
const PRODUCT_DETAIL_QUESTION = /(?:นุ่ม|ใส่สบาย|รองรับแรงกระแทก|ทน|คุณภาพ|รีวิว|สเปก|เหมาะกับ|comfort|cushion|durab|review|spec|quality)/iu;
const AVAILABILITY_QUESTION = /^(?:(?:ใน)?ร้าน(?:นี้)?|ที่นี่|เว็บ(?:นี้)?|เว็บไซต์(?:นี้)?)?\s*มี(.+?)(?:ไหม|มั้ย|มัย|หรือเปล่า|รึเปล่า|หรือไม่)[?？]*$/iu;
const RECOMMENDATION_REQUEST = /(?:มีอะไร(?:แนะนำ|น่าสนใจ|ขายดี)|อะไร(?:แนะนำ|น่าสนใจ|ขายดี)|แนะนำ(?:สินค้า|ของ|หน่อย|ให้หน่อย)?|สินค้า(?:ขายดี|แนะนำ)|ยอดนิยม|best\s*seller|recommend)/iu;
// English terms use word boundaries so normal words such as "Designing" do
// not accidentally match the "sign in" safety rule.
const SENSITIVE_REQUEST = /(?:\b(?:password|token|secret|api.?key|checkout|payment|pay|billing|login|sign[ -]?in|admin)\b|รหัสผ่าน|โทเคน|ชำระ|จ่ายเงิน|เข้าสู่ระบบ|แอดมิน)/iu;

// Filler words stripped when extracting the real search target from a query.
// Anything that remains after stripping is what the user actually wants to find.
const QUERY_FILLER = /(?:หน้า(?=\s|ซึ่ง)|อยากรู้ว่า|พาไป(?:หา)?|ไปหน้า|ช่วยหา|ช่วย|หาให้|หา(?=\s|$)|อยากได้|ต้องการ|ขอดู|อยากดู|อยากรู้|หน่อย|ให้หน่อย|ได้ไหม|ไหม|มีไหม|มีมั้ย|หรือเปล่า|บ้าง|เลย|นะ|ครับ|ค่ะ|คะ|please|show me|take me to|where is|find|look for|\bget\b|\bsee\b|\bneed\b|\bwant\b)/giu;

function normalize(value) {
    return normalizeHumanText(value);
}

function isPrivateContextMarker(item) {
    return String(item && item.name || '').trim().toLocaleLowerCase('th-TH').startsWith(PRIVATE_CONTEXT_PREFIX);
}

function words(value) {
    return [...new Set(normalize(value).match(/[\p{L}\p{M}\p{N}]{2,}/gu) || [])];
}

// Thai commonly omits spaces, so exact word tokenization is not enough for
// questions such as "ร้านเปิดวันไหน" versus "ร้านเปิดทุกวัน". A shared
// Thai character phrase of at least five code points is useful evidence; four
// could accidentally match the short word "ร้าน" including a tone mark.
function thaiPhraseScore(query, text) {
    const compactQuery = normalize(query).replace(/[^\p{Script=Thai}\p{M}]/gu, '');
    const compactText = normalize(text).replace(/[^\p{Script=Thai}\p{M}]/gu, '');
    if (compactQuery.length < 5 || compactText.length < 5) return 0;
    const maxLength = Math.min(12, compactQuery.length);
    for (let length = maxLength; length >= 5; length--) {
        for (let index = 0; index <= compactQuery.length - length; index++) {
            if (compactText.includes(compactQuery.slice(index, index + length))) return 8 + length;
        }
    }
    return 0;
}

function score(query, text, aliases = []) {
    const q = normalize(query);
    const candidates = [text, ...aliases].map(normalize).filter(Boolean);
    const all = candidates.join(' ');
    if (!q || !all) return 0;
    if (all.includes(q)) return 120 + Math.min(q.length, 30);

    // Thai does not reliably have whitespace boundaries. Known names and
    // aliases are therefore matched as complete phrases first.
    const phraseScore = candidates.reduce((best, candidate) => {
        return candidate.length >= 3 && q.includes(candidate)
            ? Math.max(best, 90 + Math.min(candidate.length, 30))
            : best;
    }, 0);
    if (phraseScore) return phraseScore;

    const wordScore = words(q).reduce((total, word) => total + (word.length >= 3 && all.includes(word) ? 10 : 0), 0);
    return wordScore + thaiPhraseScore(q, all);
}

function safeText(value, max = 480) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function publicPrice(value) {
    const match = String(value || '').match(/(?:฿|บาท)\s*([0-9][0-9,]*)/iu);
    return match ? Number(match[1].replace(/,/g, '')) : undefined;
}

function cleanKnowledge(data) {
    return {
        pages: Array.isArray(data && data.pages) ? data.pages : [],
        catalog: Array.isArray(data && data.catalog) ? data.catalog : [],
        glossary: Array.isArray(data && data.glossary) ? data.glossary : []
    };
}

function loadKnowledge(siteProfile) {
    try {
        const data = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
        const defaultKnowledge = cleanKnowledge(data);
        const profileKnowledge = cleanKnowledge(siteProfile && siteProfile.knowledge);

        // Profiles are isolated by default.  The demo registry is never used
        // for an unregistered website; only the explicit local demo profile
        // opts into repository demonstration data.
        if (!siteProfile || !siteProfile.useDefaultKnowledge) return profileKnowledge;
        return {
            pages: [...profileKnowledge.pages, ...defaultKnowledge.pages],
            catalog: [...profileKnowledge.catalog, ...defaultKnowledge.catalog],
            glossary: [...profileKnowledge.glossary, ...defaultKnowledge.glossary]
        };
    } catch (error) {
        console.error('[IndicatorAgent] Could not load knowledge:', error.message);
        return { pages: [], catalog: [], glossary: [] };
    }
}

function runtimeKnowledge(payload) {
    const knowledge = loadKnowledge(payload && payload.siteProfile);
    // `expertKnowledge` is provided by the chat API after it has stored a
    // public page snapshot.  Direct callers can omit it; in that case the
    // tenant-scoped store is read here.  Static catalog data is kept first so
    // a page mention can never override an authoritative stock/price record.
    const learned = cleanKnowledge(payload && payload.expertKnowledge || getSiteKnowledge(payload && payload.siteProfile));
    knowledge.pages = [...knowledge.pages, ...learned.pages];
    knowledge.catalog = [...knowledge.catalog, ...learned.catalog];
    knowledge.glossary = [...knowledge.glossary, ...learned.glossary];
    const siteDNA = payload && payload.siteDNA && typeof payload.siteDNA === 'object' ? payload.siteDNA : {};
    const currentUrl = String(payload && payload.url || '/');
    const headings = Array.isArray(siteDNA.headings) ? siteDNA.headings : [];
    const entities = Array.isArray(siteDNA.entities) ? siteDNA.entities : [];

    knowledge.pages.unshift({
        id: 'current-page',
        title: String(payload && payload.title || siteDNA.title || 'หน้าปัจจุบัน'),
        url: currentUrl,
        headings,
        content: String(payload && payload.pageContent || siteDNA.activeSectionText || ''),
        keywords: []
    });

    // The widget extracts visible product cards. These runtime entries make a
    // tenant's current page useful even before a catalog integration exists.
    const visibleCatalog = [];
    entities.slice(0, 80).forEach((entity, index) => {
        // The widget appends a visible price in parentheses.  Keep the actual
        // product title clean so the Agent can match natural Thai requests.
        const rawName = safeText(entity, 240);
        const name = rawName.replace(/\s*\([^)]*(?:฿|บาท|\d)[^)]*\)\s*$/u, '').trim();
        if (!name) return;
        visibleCatalog.push({
            id: `visible-${index + 1}`,
            name,
            description: 'รายการที่พบในหน้าเว็บปัจจุบัน',
            price: publicPrice(rawName),
            // A product card proves the item is published, not live stock.
            inStock: null,
            url: currentUrl,
            keywords: [rawName]
        });
    });
    // Current-page facts are fresher than a previously learned snapshot. This
    // also prevents an old snapshot from hiding the current product price.
    knowledge.catalog = [...visibleCatalog, ...knowledge.catalog].filter(item => !isPrivateContextMarker(item));
    return knowledge;
}

function actionFor({ title, url, currentUrl, keywords = [], permissions = [] }) {
    if (Array.isArray(permissions) && permissions.length && !permissions.includes('navigate_same_origin')) return null;
    const targetText = safeText(title, 200);
    try {
        const current = new URL(currentUrl || '/', 'https://indicator.local');
        const destination = new URL(url || '/', current);
        if (destination.origin !== current.origin) return null;
        const safeUrl = `${destination.pathname}${destination.search}${destination.hash}`;
        // Same page: warp (scroll to element)
        if (destination.pathname === current.pathname) {
            return { type: 'warp', targetText, keywords: keywords.slice(0, 5) };
        }
        // Different page on same origin: use warp_cross_page (widget knows this action type)
        return { type: 'warp_cross_page', url: safeUrl, targetText, keywords: keywords.slice(0, 5) };
    } catch (_) {
        return null;
    }
}

function base(reply, extra = {}) {
    return { reply, cssCommand: '', action: null, interactive: null, status: 'ok', ...extra };
}

function availabilitySubject(prompt) {
    const match = normalize(prompt).match(AVAILABILITY_QUESTION);
    if (!match) return '';
    return safeText(match[1].replace(/^(?:สินค้า|ของ|แบบ)/iu, '').trim(), 160);
}

/**
 * Extract the core subject the user is actually looking for.
 * Works across Thai and English by stripping navigation/filler verbs.
 * e.g. "Enterprise พาไปหาหน่อย" → "Enterprise"
 *      "อยากดูราคา Pro Matrix" → "ราคา Pro Matrix"
 *      "ช่วยหาหน้าติดต่อเรา" → "ติดต่อเรา"
 */
function extractQuerySubject(rawPrompt) {
    const text = normalize(rawPrompt)
        .replace(QUERY_FILLER, ' ')
        .replace(REQUEST_FILLER, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // Remove very short leftover particles
    return text.split(/\s+/).filter(w => w.length > 1).join(' ');
}

/**
 * Build a robust keyword list for DOM/page warp from the raw prompt.
 * Combines: extracted subject words + English tokens + numeric/brand fragments.
 */
function buildWarpKeywords(rawPrompt) {
    const subject = extractQuerySubject(rawPrompt);
    const subjectWords = subject
        .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1);
    const englishTokens = normalize(rawPrompt).match(/[a-z0-9][a-z0-9\-_]{1,}/gi) || [];
    const combined = [...new Set([...subjectWords, ...englishTokens])].slice(0, 10);
    return { subject, keywords: combined };
}

/**
 * Score how well a live siteDNA heading/entity matches the user query.
 * Uses direct substring containment — fast and language-agnostic.
 * Strips heading tag prefixes like "h2:", "h3:" before comparing.
 */
function livePageScore(querySubject, rawText) {
    if (!querySubject || !rawText) return 0;
    // Strip DOM heading prefixes that the widget adds: "h1:", "h2:", "h3:"
    const text = String(rawText).replace(/^h[1-6]:/i, '');
    const q = normalize(querySubject);
    const t = normalize(text);
    if (!q || !t) return 0;
    if (t.includes(q)) return 100 + q.length;
    if (q.includes(t) && t.length > 2) return 80 + t.length;
    // Word-level overlap
    const qWords = q.split(/\s+/).filter(w => w.length > 1);
    const hits = qWords.filter(w => t.includes(w));
    return hits.length > 0 ? (hits.length / qWords.length) * 60 : 0;
}

function conversationalReply(prompt, identity) {
    const text = normalize(prompt);
    if (/^(?:สวัสดี|หวัดดี|hello|hi|ดีครับ|ดีค่ะ)[!！. ]*$/iu.test(text)) {
        return `สวัสดีครับ ผมคือ ${identity.name} มีอะไรให้ช่วยค้นหาหรืออธิบายไหมครับ`;
    }
    if (/(?:ขอบคุณ|thank(?:s| you)?)/iu.test(text)) return 'ยินดีครับ มีอะไรให้ช่วยต่อได้เลย';
    if (/(?:คุณคือใคร|ชื่ออะไร|ทำอะไรได้บ้าง|who are you|what can you do)/iu.test(text)) {
        return `ผมคือ ${identity.name} ทำหน้าที่เป็น${identity.role} ช่วยค้นหาข้อมูลในเว็บไซต์ ตอบจากข้อมูลที่มีแหล่งอ้างอิง และพาไปยังหน้าที่เกี่ยวข้องได้ครับ`;
    }
    return '';
}

function intentFor(prompt) {
    const text = normalize(prompt);
    if (RECOMMENDATION_REQUEST.test(text)) return 'recommend_products';
    if (availabilitySubject(text)) return 'find_product';
    if (/(เจ้าหน้าที่|พนักงาน|human|agent)/iu.test(text)) return 'handoff';
    if (/(สรุป|summari[sz]e|ย่อ)/iu.test(text)) return 'summarize';
    if (/(คำศัพท์|คำว่า|หมายถึง|definition|meaning)/iu.test(text)) return 'define_term';
    if (/(หัวข้อ|บทความ|นโยบาย|where|page|section|heading)/iu.test(text)) return 'search_unified';
    if (PRODUCT_TERMS.some(term => text.includes(term)) || /(สินค้า|ราคา|ไซซ์|size|สี|color|รุ่น|อยากได้|ต้องการ|ขอ|looking for|\bneed\b|\bwant\b)/iu.test(text)) return 'search_unified';
    if (/(พาไป|ไปหน้า)/iu.test(text)) return 'search_unified';
    if (/(หา|find)/iu.test(text)) return 'search_unified';
    return 'answer';
}

function bestMatch(items, prompt, textForItem, aliasesForItem = () => []) {
    return items
        .map(item => ({ item, score: score(prompt, textForItem(item), aliasesForItem(item)) }))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)[0]?.item || null;
}

function productScore(prompt, product) {
    const withoutListWords = PRODUCT_LIST_REQUEST.test(normalize(prompt))
        ? normalize(prompt).replace(/(?:มี|อะไรบ้าง|แบบไหน|รุ่นไหน|ตัวไหน|ทั้งหมด|รายการ|ตัวเลือก)/giu, ' ')
        : normalize(prompt);
    const query = withoutListWords.replace(REQUEST_FILLER, ' ').replace(/\s+/g, ' ').trim();
    const haystack = `${product.name || ''} ${product.description || ''} ${(product.keywords || []).join(' ')}`;
    if (!query || !haystack.trim()) return 0;
    let total = score(query, haystack, product.keywords || []);
    const compactQuery = query.replace(/\s+/g, '');
    const compactHaystack = normalize(haystack).replace(/\s+/g, '');
    for (const cue of PRODUCT_CUES) {
        if (compactQuery.includes(cue) && compactHaystack.includes(cue)) total += 24;
    }
    // Numbers with units express a customer constraint. For example,
    // "กางเกง 3 ส่วน" must rank above another generic pair of trousers.
    const measurements = compactQuery.match(/\d+(?:ส่วน|นิ้ว|ml|cm|mm|gb|kg)?/giu) || [];
    for (const measurement of measurements) {
        if (measurement.length > 1 && compactHaystack.includes(measurement)) total += 70;
    }
    // Categories are scored above. Keep fuzzy matching for real product
    // names/keywords so "รองเท้าปีนเขา" is not treated as any "รองเท้า".
    total += fuzzyPhraseScore(query, productPhrases(product));
    return total;
}

function rankedProductMatches(items, prompt, limit = 5) {
    const ranked = items
        .map(item => ({ item, score: productScore(prompt, item) }))
        // A shared broad category alone (for example "รองเท้า") is not
        // enough to select an arbitrary product. Require another signal such
        // as a model, feature, brand, or numeric constraint first.
        .filter(result => result.score >= 50)
        .sort((left, right) => right.score - left.score)
        .map(result => result.item);
    const seen = new Set();
    return ranked.filter(item => {
        const key = normalize(item.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, limit);
}

function bestProductMatch(items, prompt) {
    return rankedProductMatches(items, prompt, 1)[0] || null;
}

function recentHistory(payload) {
    if (!Array.isArray(payload && payload.history)) return [];
    return payload.history.slice(-MAX_CONTEXT_MESSAGES).map(item => ({
        role: item && item.role === 'assistant' ? 'assistant' : 'user',
        text: safeText(item && item.text, 1000)
    })).filter(item => item.text);
}

function productFromHistory(knowledge, payload) {
    const assistantReplies = recentHistory(payload).filter(item => item.role === 'assistant').reverse();
    const products = knowledge.catalog
        .filter(item => !isPrivateContextMarker(item))
        .slice()
        .sort((left, right) => normalize(right.name).length - normalize(left.name).length);
    for (const message of assistantReplies) {
        const reply = normalize(message.text);
        // A previous assistant reply is untrusted context, but it may safely
        // select a record that already exists in the approved catalog.
        const exactProduct = products.find(product => {
            const name = normalize(product.name);
            return name.length >= 4 && reply.includes(name);
        });
        if (exactProduct) return exactProduct;
        const product = bestProductMatch(products, message.text);
        if (product && reply.includes(normalize(product.name))) return product;
    }
    return null;
}

function asksAboutPreviousProduct(prompt) {
    const text = normalize(prompt);
    return /(?:มัน|อันนี้|สินค้านี้|รายการนี้|ตัวนี้|รุ่นนี้|เมื่อกี้|ก่อนหน้า|ราคา.*(?:เท่าไหร่|เท่าไร)|(?:เท่าไหร่|เท่าไร).*ราคา|มี.*(?:ไซซ์|ขนาด|สี)|นุ่ม|ใส่สบาย|รองรับแรงกระแทก|ทน|คุณภาพ|รีวิว|สเปก|เหมาะกับ|comfort|cushion|durab|review|spec|quality|what is it|this product|that product|\bit\b|\bthis\b|\bthat\b)/iu.test(text);
}

function externalResults(payload) {
    const results = payload && payload.externalResearch && payload.externalResearch.results;
    if (!Array.isArray(results)) return [];
    return results.map(item => ({
        title: safeText(item && item.title, 160),
        snippet: safeText(item && item.snippet, 420),
        url: safeText(item && item.url, 500)
    })).filter(item => item.title && item.snippet && /^https?:\/\//i.test(item.url)).slice(0, 3);
}

function explainProduct(product, payload) {
    const description = safeText(product.description || 'สินค้าที่อยู่ในแคตตาล็อกของเว็บไซต์', 320);
    const price = Number.isFinite(product.price) ? ` ราคา ${product.price.toLocaleString('th-TH')} บาท` : '';
    const availability = product.inStock === false
        ? ' สินค้าหมดชั่วคราว'
        : product.inStock === true ? ' มีสินค้า' : ' พบข้อมูลรายการนี้บนเว็บไซต์';
    const isDetailQuestion = PRODUCT_DETAIL_QUESTION.test(String(payload && payload.prompt || ''));
    const research = externalResults(payload);

    if (isDetailQuestion && research.length) {
        const evidence = research.map(item => `${item.title}: ${item.snippet}`).join(' | ');
        return base(`จากข้อมูลภายนอกเกี่ยวกับ ${product.name}: ${evidence}`, {
            sources: research.map(item => ({ type: 'external_research', title: item.title, url: item.url }))
        });
    }

    if (isDetailQuestion) {
        return base(`จากข้อมูลบนเว็บ ${product.name} ระบุว่า ${description}${price}.${availability} แต่ยังไม่มีข้อมูลยืนยันเรื่อง “${safeText(payload.prompt, 80)}” ครับ`, {
            sources: [{ type: 'catalog', id: product.id, url: product.url }],
            // api/chat may enrich this response with a configured external
            // research connector.  No browser-provided URL is ever fetched.
            researchRequest: payload.externalResearch === undefined ? {
                subject: safeText(product.name, 180),
                question: safeText(payload.prompt, 180)
            } : null
        });
    }
    return base(`${product.name} คือ ${description}${price}.${availability} ครับ`, {
        action: actionFor({
            title: product.name,
            url: product.url,
            currentUrl: payload.url,
            keywords: product.keywords || [],
            permissions: payload.siteProfile && payload.siteProfile.permissions
        }),
        interactive: {
            type: 'carousel',
            items: [{ title: product.name, subtitle: product.inStock === false ? 'สินค้าหมดชั่วคราว' : product.inStock === true ? 'มีสินค้า' : 'พบในเว็บไซต์', url: product.url }]
        },
        sources: [{ type: 'conversation_catalog', id: product.id, url: product.url }]
    });
}

function findProduct(knowledge, payload, prompt, preMatchedProducts = null) {
    const products = preMatchedProducts || rankedProductMatches(knowledge.catalog, prompt);
    if (!products.length) {
        // Redirect to unified search if called directly
        return searchUnified(knowledge, payload, prompt);
    }

    const product = products[0];
    const wantsList = PRODUCT_LIST_REQUEST.test(normalize(prompt));
    const productItems = products.map(item => ({
        title: item.name,
        subtitle: Number.isFinite(item.price) ? `ราคา ${item.price.toLocaleString('th-TH')} บาท` : item.inStock === false ? 'สินค้าหมดชั่วคราว' : 'พบในหน้าร้าน',
        url: item.url
    }));
    if (wantsList) {
        const list = productItems.map(item => `${item.title}${item.subtitle.startsWith('ราคา') ? ` (${item.subtitle})` : ''}`).join(', ');
        return base(`ในร้านนี้พบ ${products.length} รายการ: ${list}`, {
            interactive: { type: 'carousel', items: productItems },
            sources: products.map(item => ({ type: 'catalog', id: item.id, url: item.url }))
        });
    }

    const action = actionFor({
        title: product.name,
        url: product.url,
        currentUrl: payload.url,
        keywords: product.keywords || [],
        permissions: payload.siteProfile && payload.siteProfile.permissions
    });
    const price = Number.isFinite(product.price) ? ` ราคา ${product.price.toLocaleString('th-TH')} บาท` : '';
    return base(`เจอ ${product.name}${price} ครับ ผมพาไปที่รายการนี้ให้แล้ว`, {
        action,
        interactive: {
            type: 'carousel',
            items: productItems
        },
        sources: [{ type: 'catalog', id: product.id, url: product.url }]
    });
}

function recommendProducts(knowledge) {
    const seen = new Set();
    const products = knowledge.catalog.filter(product => {
        const key = normalize(product && product.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 6);
    if (!products.length) {
        return base('ผมยังไม่พบรายการสินค้าที่แนะนำได้จากข้อมูลร้านนี้ครับ');
    }
    const items = products.map(product => ({
        title: product.name,
        subtitle: Number.isFinite(product.price)
            ? `ราคา ${product.price.toLocaleString('th-TH')} บาท`
            : product.inStock === false ? 'สินค้าหมดชั่วคราว' : 'พบในหน้าร้าน',
        url: product.url
    }));
    // A recommendation is a choice, not permission to navigate. Keep the
    // visitor on the page and let them select an item from the carousel.
    return base(`ในร้านนี้มีรายการที่น่าสนใจ ${items.length} รายการ ลองเลือกดูได้เลยครับ`, {
        interactive: { type: 'carousel', items },
        sources: products.map(product => ({ type: 'catalog', id: product.id, url: product.url }))
    });
}

function searchUnified(knowledge, payload, prompt) {
    // 1. Try to find a product first (highest precision via catalog)
    const products = rankedProductMatches(knowledge.catalog, prompt);
    if (products.length > 0) {
        return findProduct(knowledge, payload, prompt, products);
    }

    // 2. Extract the real search subject from the raw query (Thai/English)
    //    This must happen before any knowledge lookup so we warp with the right text.
    const { subject, keywords } = buildWarpKeywords(prompt);
    const targetText = subject || safeText(prompt, 120);

    // 3. Live page match FIRST: the widget already extracted headings/entities from the DOM.
    //    If the subject is right on the current page — warp immediately, no knowledge needed.
    const siteDNA = payload && payload.siteDNA || {};
    const liveHeadings = Array.isArray(siteDNA.headings) ? siteDNA.headings : [];
    const liveEntities = Array.isArray(siteDNA.entities) ? siteDNA.entities : [];
    const liveContent = normalize(String(siteDNA.activeSectionText || payload.pageContent || ''));

    const allLiveText = [...liveHeadings, ...liveEntities];
    let bestLive = null, bestLiveScore = 0;
    for (const text of allLiveText) {
        const s = livePageScore(subject, text);
        if (s > bestLiveScore) { bestLiveScore = s; bestLive = text; }
    }

    const subjectInContent = subject && liveContent.includes(normalize(subject));
    const hasLiveMatch = bestLiveScore >= 40 || subjectInContent;

    if (hasLiveMatch) {
        const cleanLive = bestLive ? String(bestLive).replace(/^h[1-6]:/i, '') : subject;
        const warpKw = keywords.length > 0 ? keywords : [subject];
        return base(`พบ "${cleanLive}" บนหน้านี้แล้วครับ กำลังพาไปให้`, {
            action: { type: 'warp', targetText: cleanLive, keywords: warpKw, searchAll: false },
            sources: [{ type: 'live_page', query: subject }]
        });
    }

    // 4. Try static page knowledge match (for cross-page navigation)
    const page = bestMatch(
        knowledge.pages,
        prompt,
        item => `${item.title || ''} ${(item.headings || []).join(' ')} ${item.content || ''}`,
        item => item.keywords || []
    );
    if (page) {
        return findContent(knowledge, payload, prompt, page);
    }

    // 5. Ultimate fallback: broadcast warp+cross-search with properly extracted keywords
    //    so the widget's crossSearch/findEl can locate the target anywhere on the site
    const wantsList = PRODUCT_LIST_REQUEST.test(normalize(prompt));
    return base(`กำลังค้นหา "${targetText}" ในเว็บไซต์นี้ครับ`, {
        action: { type: 'warp', targetText, keywords, searchAll: true, showResults: wantsList },
        sources: [{ type: 'site_search', query: targetText }]
    });
}

function findContent(knowledge, payload, prompt, matchedPage = null) {
    const page = matchedPage || bestMatch(
        knowledge.pages,
        prompt,
        item => `${item.title || ''} ${(item.headings || []).join(' ')} ${item.content || ''}`,
        item => item.keywords || []
    );
    if (!page) {
        // Redirect to unified search fallback if called directly
        return searchUnified(knowledge, payload, prompt);
    }
    const destination = `${page.url || '/'}${page.anchor ? `#${String(page.anchor).replace(/^#/, '')}` : ''}`;
    const pageTitle = ((page.headings && page.headings[0]) || page.title || '').replace(/^h[1-6]:/i, '');
    return base(`พบ "${pageTitle || page.title}" ครับ ผมพาไปยังจุดที่เกี่ยวข้องให้แล้ว`, {
        action: actionFor({
            title: pageTitle || page.title,
            url: destination,
            currentUrl: payload.url,
            keywords: (page.headings || []).map(h => String(h).replace(/^h[1-6]:/i, '')),
            permissions: payload.siteProfile && payload.siteProfile.permissions
        }),
        sources: [{ type: 'page', id: page.id, url: destination }]
    });
}

function defineTerm(knowledge, payload, prompt) {
    const entry = bestMatch(
        knowledge.glossary,
        prompt,
        item => `${item.term || ''} ${item.definition || ''}`,
        item => item.aliases || []
    );
    if (!entry) return findContent(knowledge, payload, prompt);
    const destination = `${entry.url || '/'}${entry.anchor ? `#${String(entry.anchor).replace(/^#/, '')}` : ''}`;
    return base(`${entry.term}: ${safeText(entry.definition)}`, {
        action: actionFor({ title: entry.term, url: destination, currentUrl: payload.url, keywords: entry.aliases || [], permissions: payload.siteProfile && payload.siteProfile.permissions }),
        sources: [{ type: 'glossary', id: entry.id, url: destination }]
    });
}

function summarize(knowledge, payload) {
    const page = knowledge.pages.find(item => item.id === 'current-page');
    const content = safeText(page && page.content || payload && payload.siteDNA && payload.siteDNA.activeSectionText);
    return base(content ? `สรุป: ${content}` : 'หน้านี้ยังมีข้อมูลไม่พอให้สรุปครับ');
}

function excerptFor(page, prompt) {
    const content = safeText(page && page.content, 1200);
    if (!content) return '';
    const terms = words(prompt).filter(term => term.length >= 3);
    const lower = normalize(content);
    let index = -1;
    for (const term of terms) {
        index = lower.indexOf(term);
        if (index >= 0) break;
    }
    if (index < 0) return safeText(content, 360);
    return safeText(content.slice(Math.max(0, index - 120), index + 360), 480);
}

function answerFromWebsiteKnowledge(knowledge, payload, prompt) {
    const asksHours = /(?:เปิด|ปิด).*(?:วัน|โมง|เวลา)|เวลาทำการ|opening\s*hours|business\s*hours|\bhours\b/iu.test(normalize(prompt));
    const hoursPage = asksHours && knowledge.pages.find(item => /(?:เวลาทำการ|เปิด(?:ทุก|วัน|เวลา)|ปิด(?:ทุก|วัน|เวลา)|opening\s*hours|business\s*hours)/iu.test(`${item.title || ''} ${(item.headings || []).join(' ')} ${item.content || ''}`));
    const page = hoursPage || bestMatch(
        knowledge.pages,
        prompt,
        item => `${item.title || ''} ${(item.headings || []).join(' ')} ${item.content || ''}`,
        item => item.keywords || []
    );
    if (!page) return null;
    const excerpt = excerptFor(page, prompt);
    if (!excerpt) return null;
    const destination = `${page.url || '/'}${page.anchor ? `#${String(page.anchor).replace(/^#/, '')}` : ''}`;
    return base(`จากหน้า “${page.title}”: ${excerpt}`, {
        action: actionFor({
            title: page.headings && page.headings[0] || page.title,
            url: destination,
            currentUrl: payload.url,
            keywords: page.headings || [],
            permissions: payload.siteProfile && payload.siteProfile.permissions
        }),
        sources: [{ type: page.learned ? 'learned_public_page' : 'page', id: page.id, url: destination }]
    });
}

function runIndicatorAgent(payload = {}) {
    const prompt = safeText(payload.prompt, MAX_PROMPT_CHARS);
    if (!prompt) return { ...base('กรุณาพิมพ์สิ่งที่ต้องการให้ช่วยก่อนครับ'), status: 'error' };
    if (SENSITIVE_REQUEST.test(prompt)) {
        return { ...base('เพื่อความปลอดภัย ผมไม่สามารถดำเนินการในส่วนข้อมูลสำคัญหรือการชำระเงินเองได้ แต่ผมอธิบายขั้นตอนหรือส่งต่อเจ้าหน้าที่ให้ได้ครับ'), status: 'blocked' };
    }

    const knowledge = runtimeKnowledge(payload);
    const identity = inferSiteIdentity(payload);
    const contextualProduct = productFromHistory(knowledge, payload);
    let intent = intentFor(prompt);
    const productMatch = bestProductMatch(knowledge.catalog, prompt);
    // A brand-only request such as "อยากได้ nike" is still a product request
    // when the brand occurs in the approved catalog.  Specific policy/article
    // wording remains a content request and is not overridden.
    if (intent === 'answer' && productMatch) intent = 'find_product';
    // A visitor often writes only "หา <product name>".  Prefer a known
    // catalog match over a page search so the Agent behaves like a sales
    // assistant without requiring a rigid keyword such as "สินค้า".
    if (intent === 'find_content' && productMatch && !/(หัวข้อ|บทความ|นโยบาย|where|page|section|heading)/iu.test(normalize(prompt))) {
        intent = 'search_unified';
    }
    let result;
    if (contextualProduct && asksAboutPreviousProduct(prompt)) {
        result = explainProduct(contextualProduct, payload);
    } else switch (intent) {
        case 'recommend_products': result = recommendProducts(knowledge); break;
        case 'search_unified': result = searchUnified(knowledge, payload, prompt); break;
        case 'find_product': result = searchUnified(knowledge, payload, prompt); break;
        case 'find_content': result = searchUnified(knowledge, payload, prompt); break;
        case 'define_term': result = defineTerm(knowledge, payload, prompt); break;
        case 'summarize': result = summarize(knowledge, payload); break;
        case 'handoff': result = base('ผมจะสรุปเรื่องที่คุยไว้ให้เจ้าหน้าที่ช่วยต่อครับ', { action: { type: 'handoff' } }); break;
        default: {
            const knowledgeAnswer = answerFromWebsiteKnowledge(knowledge, payload, prompt);
            if (knowledgeAnswer) {
                result = knowledgeAnswer;
            } else {
                const conv = conversationalReply(prompt, identity);
                if (conv) {
                    result = base(conv);
                } else {
                    result = base(`ขออภัยครับ ผมอาจจะยังไม่เข้าใจความหมาย หากต้องการให้ผมช่วยหาสินค้า บทความ หรือนโยบายต่างๆ ลองพิมพ์คำสำคัญสั้นๆ มาได้เลยครับ`);
                }
            }
            break;
        }
    }
    return {
        ...result,
        agent: {
            name: safeText(identity.name, 120),
            role: safeText(identity.role, 160),
            purpose: safeText(identity.purpose, 240)
        }
    };
}

module.exports = { runIndicatorAgent, intentFor, score };
