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
const EXPERTISE_PATH = path.join(__dirname, '..', 'data', 'site-expertise.json');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MAX_PROMPT_CHARS = 1200;
const MAX_CONTEXT_MESSAGES = 8;
const MAX_RUNTIME_ENTITIES = 120;
const MAX_LOCAL_CATALOG_ITEMS = 240;
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

function numericPrice(value) {
    if (Number.isFinite(value)) return Number(value);
    const text = String(value || '').replace(/,/g, '');
    const direct = text.match(/(?:฿|บาท)?\s*([0-9]{1,9})(?:\.\d+)?/u);
    return direct ? Number(direct[1]) : undefined;
}

function safeSameOriginUrl(value, currentUrl) {
    try {
        const current = new URL(String(currentUrl || '/'), 'https://indicator.local');
        const destination = new URL(String(value || current.pathname || '/'), current);
        if (destination.origin !== current.origin) return currentUrl || '/';
        return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch (_) {
        return currentUrl || '/';
    }
}

function normalizeRuntimeEntity(entity, index, currentUrl) {
    if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
        const name = safeText(entity.title || entity.name || entity.label, 220);
        if (!name || isPrivateContextMarker({ name })) return null;
        const description = safeText(entity.description || entity.desc || entity.text || '', 420);
        const price = numericPrice(entity.price);
        const url = safeSameOriginUrl(entity.href || entity.url || currentUrl, currentUrl);
        const keywords = [...new Set([
            name,
            safeText(entity.alt, 180),
            safeText(entity.type, 80),
            safeText(entity.text, 260),
            description
        ].filter(Boolean))].slice(0, 12);
        return {
            id: safeText(entity.id || `visible-structured-${index + 1}`, 160),
            entityId: safeText(entity.id, 160) || undefined,
            selector: safeText(entity.selector, 260) || undefined,
            name,
            description: description || 'รายการที่พบในหน้าเว็บปัจจุบัน',
            price,
            inStock: entity.inStock === true ? true : entity.inStock === false ? false : null,
            url,
            keywords,
            runtime: true
        };
    }

    const rawName = safeText(entity, 260);
    const name = rawName.replace(/\s*\([^)]*(?:฿|บาท|\d)[^)]*\)\s*$/u, '').trim();
    if (!name || isPrivateContextMarker({ name })) return null;
    return {
        id: `visible-${index + 1}`,
        name,
        description: 'รายการที่พบในหน้าเว็บปัจจุบัน',
        price: publicPrice(rawName),
        inStock: null,
        url: currentUrl,
        keywords: [rawName, name],
        runtime: true
    };
}

// Migration-safe reader: older builds stored expertise under a previous
// profile id. We only reuse a legacy record when its public origin is exactly
// the same as the current page, so tenant data cannot cross origins.
function legacyExpertKnowledge(payload, profile) {
    try {
        const current = new URL(String(payload && payload.url || ''));
        if (!/^https?:$/i.test(current.protocol)) return { pages: [], catalog: [], glossary: [] };
        const allowed = Array.isArray(profile && profile.allowedOrigins) ? profile.allowedOrigins : [];
        if (allowed.length && !allowed.includes('*') && !allowed.includes(current.origin)) return { pages: [], catalog: [], glossary: [] };
        const data = JSON.parse(fs.readFileSync(EXPERTISE_PATH, 'utf8'));
        const sites = data && data.sites && typeof data.sites === 'object' ? Object.values(data.sites) : [];
        const site = sites.find(item => item && item.origin === current.origin && Array.isArray(item.pages));
        if (!site) return { pages: [], catalog: [], glossary: [] };

        const pages = [];
        const catalog = [];
        site.pages.forEach((page, pageIndex) => {
            const pageUrl = safeSameOriginUrl(page && page.url || '/', payload.url);
            const headings = Array.isArray(page && page.headings) ? page.headings.map(item => safeText(item, 200)).filter(Boolean).slice(0, 12) : [];
            const entities = Array.isArray(page && page.entities) ? page.entities : [];
            pages.push({
                id: `legacy-learned-page-${pageIndex + 1}`,
                title: safeText(page && page.title || 'หน้าสาธารณะ', 200),
                url: pageUrl,
                headings,
                content: safeText(page && page.content, 6000),
                keywords: [...headings, ...entities].map(item => safeText(item, 160)).filter(Boolean).slice(0, 24),
                learned: true
            });
            entities.slice(0, MAX_RUNTIME_ENTITIES).forEach((entity, entityIndex) => {
                const parsed = normalizeRuntimeEntity(entity, entityIndex, pageUrl);
                if (!parsed || isPrivateContextMarker(parsed)) return;
                parsed.id = `legacy-learned-entity-${pageIndex + 1}-${entityIndex + 1}`;
                parsed.learned = true;
                catalog.push(parsed);
            });
        });
        return { pages, catalog, glossary: [] };
    } catch (_) {
        return { pages: [], catalog: [], glossary: [] };
    }
}

function decodeJsString(value) {
    try { return JSON.parse(`"${String(value || '').replace(/"/g, '\"')}"`); }
    catch (_) { return String(value || '').replace(/\\"/g, '"').replace(/\\n/g, '\n'); }
}

// Local/public static-page fallback. This is deliberately restricted to
// localhost development pages and project-root .html files. Production sites
// should normally arrive through siteDNA.entityIndex or learned knowledge.
function loadLocalPublicCatalog(payload) {
    try {
        const url = new URL(String(payload && payload.url || ''));
        if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return [];
        let pathname = decodeURIComponent(url.pathname || '/');
        if (pathname === '/') pathname = '/index.html';
        if (!/\.html?$/i.test(pathname)) return [];
        const filePath = path.resolve(PROJECT_ROOT, `.${pathname}`);
        if (!filePath.startsWith(PROJECT_ROOT + path.sep) || !fs.existsSync(filePath)) return [];
        const html = fs.readFileSync(filePath, 'utf8');
        const catalog = [];
        const productRegex = /\{\s*id\s*:\s*(\d+)\s*,\s*name\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*cat\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*price\s*:\s*(\d+(?:\.\d+)?)\s*,\s*sale\s*:\s*(\d+(?:\.\d+)?)\s*,\s*img\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*desc\s*:\s*"((?:\\.|[^"\\])*)"(?:\s*,\s*rating\s*:\s*([0-9.]+))?\s*\}/g;
        let match;
        while ((match = productRegex.exec(html)) && catalog.length < MAX_LOCAL_CATALOG_ITEMS) {
            const id = Number(match[1]);
            const name = decodeJsString(match[2]);
            const category = decodeJsString(match[3]);
            const regularPrice = Number(match[4]);
            const salePrice = Number(match[5]);
            const image = decodeJsString(match[6]);
            const description = decodeJsString(match[7]);
            catalog.push({
                id: String(id === 47 && /nike/i.test(name) ? 'nike-air' : `local-product-${id}`),
                name,
                description,
                price: salePrice > 0 ? salePrice : regularPrice,
                originalPrice: regularPrice,
                inStock: null,
                url: `${url.pathname || '/'}#product-${id}`,
                keywords: [name, category, description, /nike/i.test(name) ? 'nike' : '', /air/i.test(name) ? 'air' : ''].filter(Boolean),
                image,
                localStatic: true
            });
        }
        return catalog;
    } catch (_) {
        return [];
    }
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
    let learned = cleanKnowledge(payload && payload.expertKnowledge || getSiteKnowledge(payload && payload.siteProfile));
    if (!learned.pages.length && !learned.catalog.length) {
        learned = legacyExpertKnowledge(payload, payload && payload.siteProfile);
    }

    knowledge.pages = [...knowledge.pages, ...learned.pages];
    knowledge.catalog = [...knowledge.catalog, ...learned.catalog];
    knowledge.glossary = [...knowledge.glossary, ...learned.glossary];

    const siteDNA = payload && payload.siteDNA && typeof payload.siteDNA === 'object' ? payload.siteDNA : {};
    const currentUrl = String(payload && payload.url || '/');
    const headings = Array.isArray(siteDNA.headings) ? siteDNA.headings : [];
    const legacyEntities = Array.isArray(siteDNA.entities) ? siteDNA.entities : [];
    const structuredEntities = Array.isArray(siteDNA.entityIndex) ? siteDNA.entityIndex : [];

    knowledge.pages.unshift({
        id: 'current-page',
        title: String(payload && payload.title || siteDNA.title || 'หน้าปัจจุบัน'),
        url: currentUrl,
        headings,
        content: String(payload && payload.pageContent || siteDNA.activeSectionText || ''),
        keywords: []
    });

    const visibleCatalog = [];
    const seenVisible = new Set();

    // Structured entities from main.js v7 are authoritative because they
    // preserve the exact DOM id/selector that the widget can warp to.
    structuredEntities.slice(0, MAX_RUNTIME_ENTITIES).forEach((entity, index) => {
        const item = normalizeRuntimeEntity(entity, index, currentUrl);
        if (!item) return;
        const key = normalize(item.name);
        if (!key || seenVisible.has(key)) return;
        seenVisible.add(key);
        visibleCatalog.push(item);
    });

    // Legacy string entities remain supported so older widgets keep working.
    legacyEntities.slice(0, MAX_RUNTIME_ENTITIES).forEach((entity, index) => {
        const item = normalizeRuntimeEntity(entity, index, currentUrl);
        if (!item) return;
        const key = normalize(item.name);
        if (!key || seenVisible.has(key)) return;
        seenVisible.add(key);
        visibleCatalog.push(item);
    });

    // Local development/demo pages can be indexed server-side if the browser
    // has not sent siteDNA yet. This keeps deterministic contract tests and
    // first-load local demos grounded in the actual public HTML file.
    const localCatalog = (structuredEntities.length || legacyEntities.length) ? [] : loadLocalPublicCatalog(payload);

    const combined = [...visibleCatalog, ...localCatalog, ...knowledge.catalog]
        .filter(item => !isPrivateContextMarker(item));
    const seenCatalog = new Set();
    knowledge.catalog = combined.filter(item => {
        const key = normalize(item && item.name);
        if (!key || seenCatalog.has(key)) return false;
        seenCatalog.add(key);
        return true;
    });
    return knowledge;
}

function actionFor({ title, url, currentUrl, keywords = [], permissions = [], entityId, selector }) {
    if (Array.isArray(permissions) && permissions.length && !permissions.includes('navigate_same_origin')) return null;
    const targetText = safeText(title, 200);
    try {
        const current = new URL(currentUrl || '/', 'https://indicator.local');
        const destination = new URL(url || '/', current);
        if (destination.origin !== current.origin) return null;
        const safeUrl = `${destination.pathname}${destination.search}${destination.hash}`;
        if (destination.pathname === current.pathname) {
            const action = { type: 'warp', targetText, keywords: keywords.slice(0, 10) };
            if (entityId) action.entityId = safeText(entityId, 160);
            if (selector) action.selector = safeText(selector, 260);
            return action;
        }
        return { type: 'navigate', url: safeUrl, targetText, keywords: keywords.slice(0, 10) };
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
    const compact = normalize(subject || rawPrompt).replace(/\s+/g, '');
    const cueTokens = PRODUCT_CUES.filter(cue => compact.includes(normalize(cue).replace(/\s+/g, '')));
    const measurementTokens = compact.match(/\d+(?:ส่วน|นิ้ว|ml|cm|mm|gb|kg)?/giu) || [];
    const combined = [...new Set([...cueTokens, ...subjectWords, ...englishTokens, ...measurementTokens])]
        .filter(token => token && token.length > 1)
        .slice(0, 12);
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
    if (/(โมโห|ไม่พอใจ|แย่มาก|ห่วย|ช้ามาก|ร้องเรียน|complaint|angry|bad|terrible)/iu.test(text)) return 'complaint';
    if (RECOMMENDATION_REQUEST.test(text)) return 'recommend_products';
    if (availabilitySubject(text)) return 'find_product';
    if (/(ติดต่อ|เบอร์โทร|อีเมล|เจ้าหน้าที่|พนักงาน|human|agent|contact|support)/iu.test(text)) return 'handoff';
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
    const normalizedPrompt = normalize(prompt);
    const withoutListWords = PRODUCT_LIST_REQUEST.test(normalizedPrompt)
        ? normalizedPrompt.replace(/(?:มี|อะไรบ้าง|แบบไหน|รุ่นไหน|ตัวไหน|ทั้งหมด|รายการ|ตัวเลือก)/giu, ' ')
        : normalizedPrompt;
    const query = withoutListWords.replace(REQUEST_FILLER, ' ').replace(/\s+/g, ' ').trim();
    const name = normalize(product && product.name);
    const description = normalize(product && product.description);
    const keywordText = normalize((product && product.keywords || []).join(' '));
    const haystack = `${name} ${description} ${keywordText}`.trim();
    if (!query || !haystack) return 0;

    let total = score(query, haystack, product.keywords || []);
    const compactQuery = query.replace(/\s+/g, '');
    const compactName = name.replace(/\s+/g, '');
    const compactHaystack = haystack.replace(/\s+/g, '');

    // Strong deterministic signals first. The Agent should never choose a
    // different card when an exact published name/brand/model is available.
    if (name === query) total += 900;
    else if (name.includes(query) && query.length >= 3) total += 460;
    else if (query.includes(name) && name.length >= 4) total += 360;

    const queryEnglish = query.match(/[a-z][a-z0-9\-_]{1,}/gi) || [];
    for (const token of queryEnglish) {
        if (name.includes(token)) total += 180;
        else if (keywordText.includes(token)) total += 90;
    }

    for (const cue of PRODUCT_CUES) {
        const normalizedCue = normalize(cue).replace(/\s+/g, '');
        if (compactQuery.includes(normalizedCue) && compactName.includes(normalizedCue)) total += 58;
        else if (compactQuery.includes(normalizedCue) && compactHaystack.includes(normalizedCue)) total += 30;
    }

    const measurements = compactQuery.match(/\d+(?:ส่วน|นิ้ว|ml|cm|mm|gb|kg)?/giu) || [];
    for (const measurement of measurements) {
        if (measurement.length > 1 && compactName.includes(measurement)) total += 130;
        else if (measurement.length > 1 && compactHaystack.includes(measurement)) total += 80;
    }

    total += fuzzyPhraseScore(query, productPhrases(product));
    return total;
}

function rankedProductMatches(items, prompt, limit = 5) {
    const normalizedPrompt = normalize(prompt);
    const subject = extractQuerySubject(prompt);
    const hasSpecificBrandOrNumber = /[a-z][a-z0-9\-_]{1,}/i.test(subject) || /\d/.test(subject);
    const wantsList = PRODUCT_LIST_REQUEST.test(normalizedPrompt);
    const threshold = hasSpecificBrandOrNumber ? 42 : wantsList ? 45 : 50;
    const ranked = items
        .map((item, index) => ({ item, index, score: productScore(prompt, item) }))
        .filter(result => result.score >= threshold)
        .sort((left, right) => right.score - left.score || left.index - right.index)
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

// Server-side short-term memory to preserve context better than client payload alone
const memoryCache = new Map();

function recentHistory(payload) {
    const convId = payload && payload.conversationId ? String(payload.conversationId) : null;
    let serverHistory = convId ? (memoryCache.get(convId) || []).slice() : [];
    const clientHistory = Array.isArray(payload && payload.history) ? payload.history : [];

    const merged = [...clientHistory, ...serverHistory].map(item => ({
        role: item && item.role === 'assistant' ? 'assistant' : 'user',
        text: safeText(item && item.text, 1000)
    })).filter(item => item.text);

    const deduped = [];
    for (const item of merged) {
        const previous = deduped[deduped.length - 1];
        if (!previous || previous.role !== item.role || previous.text !== item.text) deduped.push(item);
    }

    if (payload && payload.prompt && !payload.isProactive) {
        const promptText = safeText(payload.prompt, 1000);
        const last = deduped[deduped.length - 1];
        if (!last || last.role !== 'user' || last.text !== promptText) deduped.push({ role: 'user', text: promptText });
    }

    if (convId) {
        memoryCache.set(convId, deduped.slice(-MAX_CONTEXT_MESSAGES * 2));
    }
    return deduped.slice(-MAX_CONTEXT_MESSAGES);
}

function updateServerMemory(conversationId, assistantReply) {
    if (!conversationId) return;
    let history = memoryCache.get(conversationId) || [];
    history.push({ role: 'assistant', text: safeText(assistantReply, 1000) });
    if (history.length > MAX_CONTEXT_MESSAGES * 2) {
        history = history.slice(-MAX_CONTEXT_MESSAGES * 2);
    }
    memoryCache.set(conversationId, history);
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
            permissions: payload.siteProfile && payload.siteProfile.permissions,
            entityId: product.entityId,
            selector: product.selector
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
        permissions: payload.siteProfile && payload.siteProfile.permissions,
        entityId: product.entityId,
        selector: product.selector
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
    const availability = availabilitySubject(prompt);
    const { subject, keywords } = buildWarpKeywords(prompt);
    const targetText = availability || subject || safeText(prompt, 120);

    // Availability questions must search the whole site before saying an item
    // does not exist. This also works for categories the Agent has never seen.
    if (availability) {
        const availabilityKeywords = [...new Set([availability, ...keywords, ...PRODUCT_CUES.filter(cue => normalize(availability).includes(normalize(cue)))])]
            .filter(Boolean).slice(0, 12);
        return base(`กำลังตรวจสอบว่าในร้านนี้มี “${availability}” หรือไม่ครับ`, {
            action: { type: 'warp', targetText: availability, keywords: availabilityKeywords, searchAll: true, showResults: true },
            sources: [{ type: 'site_search', query: availability }]
        });
    }

    // Explicit navigation/page requests should resolve page knowledge before
    // fuzzy product matching. This prevents a product keyword from hijacking
    // requests such as “พาไปหน้าสมัครใช้งาน AI Chat Widget”.
    const explicitPageIntent = /(?:พาไปหน้า|ไปหน้า|หน้าสมัคร|หน้าราคา|pricing|page|section|หัวข้อ|บทความ|นโยบาย)/iu.test(normalize(prompt));
    if (explicitPageIntent) {
        const page = bestMatch(
            knowledge.pages,
            prompt,
            item => `${item.title || ''} ${(item.headings || []).join(' ')} ${item.content || ''}`,
            item => item.keywords || []
        );
        if (page) return findContent(knowledge, payload, prompt, page);
    }

    const products = rankedProductMatches(knowledge.catalog, prompt);
    if (products.length > 0) {
        return findProduct(knowledge, payload, prompt, products);
    }

    const siteDNA = payload && payload.siteDNA || {};
    const liveHeadings = Array.isArray(siteDNA.headings) ? siteDNA.headings : [];
    const liveEntities = Array.isArray(siteDNA.entities) ? siteDNA.entities : [];
    const structuredEntities = Array.isArray(siteDNA.entityIndex) ? siteDNA.entityIndex : [];
    const liveContent = normalize(String(siteDNA.activeSectionText || payload.pageContent || ''));

    // Structured entity match first so answer + warp share the same exact DOM id.
    let bestStructured = null;
    let bestStructuredScore = 0;
    for (const entity of structuredEntities.slice(0, MAX_RUNTIME_ENTITIES)) {
        const item = normalizeRuntimeEntity(entity, 0, payload.url);
        if (!item) continue;
        const value = productScore(prompt, item);
        if (value > bestStructuredScore) {
            bestStructuredScore = value;
            bestStructured = item;
        }
    }
    if (bestStructured && bestStructuredScore >= 45) {
        return findProduct({ ...knowledge, catalog: [bestStructured] }, payload, prompt, [bestStructured]);
    } else if (bestStructured && bestStructuredScore >= 35) {
        const warpKw = keywords.length > 0 ? keywords : [subject];
        return base(`พบ “${bestStructured.name}” บนหน้านี้แล้วครับ กำลังพาไปให้`, {
            action: { type: 'warp', targetText: bestStructured.name, selector: bestStructured.selector, keywords: warpKw, searchAll: false },
            sources: [{ type: 'structured_entity', query: subject }]
        });
    }

    const allLiveText = [...liveHeadings, ...liveEntities];
    let bestLive = null, bestLiveScore = 0;
    for (const text of allLiveText) {
        const value = livePageScore(subject, text);
        if (value > bestLiveScore) { bestLiveScore = value; bestLive = text; }
    }

    const subjectInContent = subject && liveContent.includes(normalize(subject));
    const hasLiveMatch = bestLiveScore >= 40 || subjectInContent;
    if (hasLiveMatch) {
        const cleanLive = bestLive ? String(bestLive).replace(/^h[1-6]:/i, '').replace(/\s*\([^)]*(?:฿|บาท|\d)[^)]*\)\s*$/u, '').trim() : subject;
        const warpKw = keywords.length > 0 ? keywords : [subject];
        return base(`พบ “${cleanLive}” บนหน้านี้แล้วครับ กำลังพาไปให้`, {
            action: { type: 'warp', targetText: cleanLive, keywords: warpKw, searchAll: false },
            sources: [{ type: 'live_page', query: subject }]
        });
    }

    const page = bestMatch(
        knowledge.pages,
        prompt,
        item => `${item.title || ''} ${(item.headings || []).join(' ')} ${item.content || ''}`,
        item => item.keywords || []
    );
    if (page) return findContent(knowledge, payload, prompt, page);

    const wantsList = PRODUCT_LIST_REQUEST.test(normalize(prompt));
    return base(`กำลังค้นหา “${targetText}” ทั่วเว็บไซต์นี้ครับ`, {
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
        case 'complaint': result = base('ต้องขออภัยในความไม่สะดวกเป็นอย่างยิ่งครับ ผมจะรีบส่งต่อเรื่องนี้ให้เจ้าหน้าที่ดูแลทันทีครับ', { action: { type: 'handoff', priority: 'high' } }); break;
        case 'handoff': result = base('ผมจะเชื่อมต่อกับเจ้าหน้าที่ให้เพื่อการดูแลที่ต่อเนื่องนะครับ', { action: { type: 'handoff' } }); break;
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
    const resultPayload = {
        ...result,
        agent: {
            name: safeText(identity.name, 120),
            role: safeText(identity.role, 160),
            purpose: safeText(identity.purpose, 240)
        }
    };

    if (payload.conversationId && result.reply) {
        updateServerMemory(payload.conversationId, result.reply);
    }
    return resultPayload;
}

module.exports = { runIndicatorAgent, intentFor, score };