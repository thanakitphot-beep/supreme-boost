'use strict';

/*
 * Optional bridge to the Python intelligence service. It is disabled unless
 * INDICATOR_INTELLIGENCE_URL is configured, and every failure returns null so
 * api/chat can safely fall back to the existing deterministic Agent.
 */

const crypto = require('crypto');

function baseUrl() {
    const configured = String(process.env.INDICATOR_INTELLIGENCE_URL || '').trim();
    if (!configured) return null;
    try {
        const url = new URL(configured);
        const localhost = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
        if (!/^https?:$/i.test(url.protocol) || url.username || url.password) return null;
        if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:' && !localhost) return null;
        return url.origin;
    } catch (_) {
        return null;
    }
}

function enabled() {
    return Boolean(baseUrl()) && Boolean(serviceToken()) && String(process.env.INDICATOR_INTELLIGENCE_MODE || 'off').toLowerCase() === 'on';
}

function serviceToken() {
    return String(process.env.INDICATOR_INTELLIGENCE_SERVICE_TOKEN || '').trim();
}

function cleanText(value, limit) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function publicPath(value) {
    try {
        const url = new URL(String(value || ''), 'https://indicator.local');
        return `${url.pathname || '/'}${url.hash || ''}`;
    } catch (_) {
        return '/';
    }
}

function priceFromText(value) {
    const match = String(value || '').match(/(?:฿|บาท)\s*([0-9][0-9,]*)/iu);
    return match ? Number(match[1].replace(/,/g, '')) : null;
}

function wordsForWarp(value) {
    return cleanText(value, 240).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(word => word.length > 1).slice(0, 8);
}

function safeWidgetAction(action, catalogItems) {
    if (!action || typeof action !== 'object') return null;
    const type = cleanText(action.type, 30);
    const catalogTarget = catalogItems[0] && catalogItems[0].title;
    const targetText = cleanText(action.target_text || catalogTarget, 240);
    if (type === 'warp' && targetText) {
        // The Python contract never supplies selectors or JavaScript. This
        // permits only a same-page visual warp to catalog text the customer
        // asked to find.
        return { type: 'warp', targetText, keywords: wordsForWarp(targetText), autoWarp: true, willNavigate: false };
    }
    if (type !== 'navigate') return null;
    const url = cleanText(action.url, 500);
    if (!url || !url.startsWith('/') || url.startsWith('//')) return null;
    return { type: 'navigate', url, targetText: targetText || url, confirmationRequired: action.confirmation_required === true };
}

function catalogFromPayload(payload) {
    const staticCatalog = payload.siteProfile && payload.siteProfile.knowledge && Array.isArray(payload.siteProfile.knowledge.catalog)
        ? payload.siteProfile.knowledge.catalog
        : [];
    const entities = payload.siteDNA && Array.isArray(payload.siteDNA.entities) ? payload.siteDNA.entities : [];
    const visibleCatalog = entities.slice(0, 80).map((entity, index) => {
        const raw = cleanText(entity, 240);
        const separator = raw.indexOf(' — ');
        const label = separator >= 0 ? raw.slice(0, separator).trim() : raw;
        const description = separator >= 0 ? raw.slice(separator + 3).trim() : 'รายการที่พบในหน้าเว็บปัจจุบัน';
        return {
            id: `visible-${index + 1}`,
            name: label.replace(/\s*\([^)]*(?:฿|บาท|\d)[^)]*\)\s*$/u, '').trim(),
            description: cleanText(description, 1500),
            price: priceFromText(label), in_stock: null, url: publicPath(payload.url), keywords: raw ? [raw] : []
        };
    }).filter(item => item.name);
    const all = [...visibleCatalog, ...staticCatalog].map(item => ({
        id: cleanText(item.id, 120), name: cleanText(item.name, 240), description: cleanText(item.description, 1500),
        price: Number.isFinite(item.price) ? item.price : null, in_stock: item.inStock === true ? true : item.inStock === false ? false : null,
        url: cleanText(item.url, 500) || '/', keywords: Array.isArray(item.keywords) ? item.keywords.map(value => cleanText(value, 120)).filter(Boolean).slice(0, 24) : []
    })).filter(item => item.id && item.name);
    const seen = new Set();
    return all.filter(item => {
        const key = item.name.toLocaleLowerCase('th-TH');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 100);
}

async function requestJson(url, body, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Indicator-Service-Token': serviceToken() },
            body: JSON.stringify(body), signal: controller.signal
        });
        return response.ok ? await response.json() : null;
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function siteId(payload) {
    const tenantId = cleanText(payload && payload.tenantId, 120);
    if (tenantId) return `tenant:${tenantId}`;
    const profileId = cleanText(payload && payload.siteProfile && payload.siteProfile.id, 120);
    if (profileId) return `profile:${profileId}`;
    if (payload && !payload.__intelligenceSiteId) payload.__intelligenceSiteId = `ephemeral:${crypto.randomUUID()}`;
    return payload && payload.__intelligenceSiteId || `ephemeral:${crypto.randomUUID()}`;
}

function conversationId(payload) {
    const supplied = cleanText(payload.conversationId, 120);
    // A missing browser session must never share memory with another visitor.
    return supplied || `ephemeral-${crypto.randomUUID()}`;
}

function conversationHistory(payload) {
    return (Array.isArray(payload.history) ? payload.history : []).slice(-8).map(item => ({
        role: item && item.role === 'assistant' ? 'assistant' : 'user',
        text: cleanText(item && item.text, 1000)
    })).filter(item => item.text && !item.text.startsWith('[indicator-answer-policy:'));
}

function sourceDocument(payload) {
    const dna = payload.siteDNA || {};
    const content = cleanText(payload.pageContent || dna.activeSectionText, 6000);
    if (!content) return null;
    const path = publicPath(payload.url);
    return {
        id: crypto.createHash('sha256').update(`${siteId(payload)}:${path}`).digest('hex').slice(0, 32),
        site_id: siteId(payload), title: cleanText(payload.title || dna.title, 240) || 'หน้าสาธารณะ', content,
        source_url: path, source_kind: 'public_page', verified: true
    };
}

function widgetResponse(result) {
    const citations = Array.isArray(result.citations) ? result.citations : [];
    const catalogItems = citations.filter(item => item && item.source_kind === 'catalog').map(item => ({
        title: cleanText(item.title, 240), subtitle: cleanText(item.excerpt, 180), url: cleanText(item.url, 500) || '/'
    })).filter(item => item.title);
    return {
        reply: cleanText(result.answer, 1600) || 'ยังไม่มีข้อมูลยืนยันเพียงพอให้ตอบครับ', cssCommand: '', action: safeWidgetAction(result.action, catalogItems),
        interactive: catalogItems.length > 1 ? { type: 'carousel', items: catalogItems } : null,
        status: result.status === 'blocked' ? 'blocked' : 'ok',
        sources: citations.map(item => ({ type: item.source_kind, id: item.source_id, url: item.url, title: item.title })),
        intelligence: { grounded: result.grounded === true, confidence: Number(result.confidence || 0) }
    };
}

async function answerWithIntelligence(payload) {
    const root = baseUrl();
    if (!enabled() || !root) return null;
    const document = sourceDocument(payload);
    if (document) await requestJson(`${root}/v1/knowledge/documents`, { documents: [document] }, 1800);
    const result = await requestJson(`${root}/v1/chat`, {
        site_id: siteId(payload), conversation_id: conversationId(payload), message: cleanText(payload.prompt, 1200),
        locale: cleanText(payload.locale, 12) || 'th', catalog: catalogFromPayload(payload), history: conversationHistory(payload)
    }, 5000);
    return result && result.answer && result.status ? widgetResponse(result) : null;
}

module.exports = { enabled, answerWithIntelligence, __siteId: siteId };
