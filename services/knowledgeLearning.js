'use strict';

/*
 * Evidence-first long-term learning for INDICATOR.
 *
 * This is intentionally not a self-training loop. Browser text and user
 * feedback can be wrong, stale, or malicious. The module therefore keeps
 * provenance for every fact, promotes only public facts published by the
 * approved site's own origin, and leaves contradictory or user-supplied
 * statements out of answerable knowledge until somebody reviews them.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { maskPII } = require('./safety');

const STORE_PATH = path.join(__dirname, '..', 'data', 'knowledge-ledger.json');
const MAX_FACTS_PER_SITE = 600;
const MAX_REVIEWS_PER_SITE = 120;
const MAX_CLAIM_CHARS = 420;
const PRIVATE_CONTEXT_PREFIX = '__indicator_context_product__:';

let inMemoryStore = null;
let memoryOnly = false;

function emptyStore() {
    return { version: 1, sites: {} };
}

function cleanText(value, max = MAX_CLAIM_CHARS) {
    return maskPII(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, max);
}

function fingerprint(value) {
    return cleanText(value, 800)
        .normalize('NFKC')
        .toLocaleLowerCase('th-TH')
        .replace(/[\s\-_,.:;!?()\[\]{}]/g, '');
}

function readStore() {
    if (inMemoryStore) return inMemoryStore;
    try {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        inMemoryStore = parsed && typeof parsed === 'object' && parsed.sites && typeof parsed.sites === 'object'
            ? parsed
            : emptyStore();
    } catch (_) {
        inMemoryStore = emptyStore();
    }
    return inMemoryStore;
}

function saveStore(store) {
    if (memoryOnly) return;
    const directory = path.dirname(STORE_PATH);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(temporaryPath, STORE_PATH);
}

function approvedProfile(profile) {
    return Boolean(
        profile && typeof profile.id === 'string' && profile.id &&
        Array.isArray(profile.permissions) && profile.permissions.includes('search_public_content')
    );
}

function publicSource(value) {
    try {
        const url = new URL(String(value || ''));
        if (!/^https?:$/i.test(url.protocol)) return null;
        if (/(?:^|\/)(?:admin|login|logout|account|profile|dashboard|checkout|payment|billing|auth|oauth|password|reset)(?:\/|$)/iu.test(url.pathname)) return null;
        // Query strings often contain search terms or identifiers, so evidence
        // uses only the public canonical path.
        return { origin: url.origin, url: `${url.origin}${url.pathname || '/'}${url.hash || ''}` };
    } catch (_) {
        return null;
    }
}

function siteEntry(store, profile, origin) {
    const previous = store.sites[profile.id];
    if (previous && previous.origin === origin && Array.isArray(previous.facts) && Array.isArray(previous.reviewQueue)) return previous;
    const fresh = { origin, facts: [], reviewQueue: [], updatedAt: null };
    store.sites[profile.id] = fresh;
    return fresh;
}

function compactProductName(value) {
    return cleanText(value, 220)
        .replace(/\s*\((?:฿|THB|บาท|ราคา)\s*[\d,.]+[^)]*\)\s*$/iu, '')
        .replace(/\s+(?:฿|THB|บาท|ราคา)\s*[\d,.]+\s*$/iu, '')
        .trim();
}

function priceFromEntity(value) {
    const match = String(value || '').match(/(?:฿|THB|ราคา\s*|บาท\s*)([\d][\d,.]*)/iu);
    return match ? match[1].replace(/,/g, '') : '';
}

function extractTopicClaims(payload = {}) {
    const dna = payload.siteDNA && typeof payload.siteDNA === 'object' ? payload.siteDNA : {};
    const candidates = [];
    const seen = new Set();
    const add = (key, value, claim) => {
        const normalizedKey = cleanText(key, 180);
        const normalizedValue = fingerprint(value);
        const normalizedClaim = cleanText(claim);
        if (!normalizedKey || !normalizedValue || !normalizedClaim) return;
        const identity = `${normalizedKey}:${normalizedValue}`;
        if (seen.has(identity)) return;
        seen.add(identity);
        candidates.push({ key: normalizedKey, value: normalizedValue, claim: normalizedClaim });
    };

    const entities = Array.isArray(dna.entities) ? dna.entities : [];
    for (const entity of entities.slice(0, 80)) {
        const text = cleanText(entity, 240);
        // Never convert a request-only conversation marker into a published
        // price or product fact.
        if (text.toLocaleLowerCase('th-TH').startsWith(PRIVATE_CONTEXT_PREFIX)) continue;
        const product = compactProductName(text);
        const price = priceFromEntity(text);
        if (product && price && fingerprint(product).length > 2) {
            add(`product_price:${fingerprint(product)}`, `price:${price}`, `${product} ราคา ${price} บาท`);
        }
    }

    const content = cleanText([
        payload.title,
        ...(Array.isArray(dna.headings) ? dna.headings : []),
        payload.pageContent,
        dna.activeSectionText
    ].filter(Boolean).join('. '), 4000);
    const topicRules = [
        { key: 'opening_hours', pattern: /(?:เวลาทำการ|opening\s*hours|เปิด(?:ทุก|วัน|เวลา|.*(?:โมง|น\.))|ปิด(?:ทุก|วัน|เวลา|.*(?:โมง|น\.)))/iu },
        { key: 'return_policy', pattern: /(?:คืนสินค้า|เปลี่ยนสินค้า|refund|return\s*policy)/iu },
        { key: 'shipping_policy', pattern: /(?:จัดส่ง|ค่าจัดส่ง|shipping|delivery)/iu }
    ];
    const sentences = content.split(/(?<=[.!?])|\n/).map(item => cleanText(item, MAX_CLAIM_CHARS)).filter(Boolean);
    for (const rule of topicRules) {
        const statement = sentences.find(sentence => rule.pattern.test(sentence));
        if (statement) add(rule.key, statement, statement);
    }
    return candidates.slice(0, 80);
}

function factId(key, value, sourceUrl) {
    return crypto.createHash('sha256').update(`${key}\n${value}\n${sourceUrl}`).digest('hex').slice(0, 24);
}

function sourceRecord(sourceUrl, observedAt) {
    return { url: sourceUrl, kind: 'official_site_public_page', observedAt };
}

function statusFor(site) {
    const facts = Array.isArray(site && site.facts) ? site.facts : [];
    const count = state => facts.filter(fact => fact.status === state).length;
    return {
        enabled: Boolean(site),
        verifiedFacts: count('verified'),
        corroboratedFacts: count('corroborated'),
        conflictedFacts: count('conflicted'),
        supersededFacts: count('superseded'),
        pendingReview: Array.isArray(site && site.reviewQueue) ? site.reviewQueue.length : 0,
        lastLearnedAt: site && site.updatedAt || null
    };
}

function getLearningStatus(profile) {
    if (!approvedProfile(profile)) {
        return { enabled: false, verifiedFacts: 0, corroboratedFacts: 0, conflictedFacts: 0, supersededFacts: 0, pendingReview: 0, lastLearnedAt: null };
    }
    return statusFor(readStore().sites[profile.id]);
}

/**
 * Adds claims from one approved site's public page. A later value from the
 * same page supersedes the older value; different public pages that disagree
 * remain conflicted and are intentionally not promoted as trusted knowledge.
 */
function learnFromPublicPage(profile, payload = {}) {
    if (!approvedProfile(profile)) return getLearningStatus(profile);
    const source = publicSource(payload.url);
    if (!source) return getLearningStatus(profile);

    const store = readStore();
    const site = siteEntry(store, profile, source.origin);
    const now = new Date().toISOString();
    const claims = extractTopicClaims(payload);
    for (const claim of claims) {
        const related = site.facts.filter(fact => fact.key === claim.key && fact.status !== 'superseded');
        const identical = related.find(fact => fact.value === claim.value);
        if (identical) {
            if (!identical.sources.some(item => item.url === source.url)) {
                identical.sources.push(sourceRecord(source.url, now));
                identical.status = identical.sources.length > 1 ? 'corroborated' : 'verified';
            }
            identical.lastObservedAt = now;
            continue;
        }

        const samePage = related.filter(fact => fact.sources.some(item => item.url === source.url));
        if (samePage.length) {
            for (const fact of samePage) fact.status = 'superseded';
        } else if (related.length) {
            for (const fact of related) fact.status = 'conflicted';
        }

        site.facts.push({
            id: factId(claim.key, claim.value, source.url),
            key: claim.key,
            value: claim.value,
            claim: claim.claim,
            status: related.length && !samePage.length ? 'conflicted' : 'verified',
            sources: [sourceRecord(source.url, now)],
            firstObservedAt: now,
            lastObservedAt: now
        });
    }
    site.facts.sort((left, right) => String(right.lastObservedAt).localeCompare(String(left.lastObservedAt)));
    site.facts = site.facts.slice(0, MAX_FACTS_PER_SITE);
    site.updatedAt = now;
    saveStore(store);
    return statusFor(site);
}

/**
 * A user can report an answer as wrong, but a report is never promoted to a
 * fact automatically. It is retained as a bounded review task with no action
 * or customer data attached.
 */
function recordCorrectionCandidate(profile, input = {}) {
    if (!approvedProfile(profile)) return getLearningStatus(profile);
    const correction = cleanText(input.correction, 800);
    const question = cleanText(input.question, 500);
    if (!correction) return getLearningStatus(profile);

    const source = publicSource(input.url);
    if (!source) return getLearningStatus(profile);
    const store = readStore();
    const site = siteEntry(store, profile, source.origin);
    const now = new Date().toISOString();
    const key = fingerprint(`${question}\n${correction}`);
    if (!site.reviewQueue.some(item => item.key === key)) {
        site.reviewQueue.unshift({
            id: crypto.createHash('sha256').update(`${key}\n${now}`).digest('hex').slice(0, 24),
            key,
            question,
            correction,
            sourceUrl: source.url,
            status: 'needs_review',
            createdAt: now
        });
        site.reviewQueue = site.reviewQueue.slice(0, MAX_REVIEWS_PER_SITE);
    }
    site.updatedAt = now;
    saveStore(store);
    return statusFor(site);
}

function resetForTests() {
    inMemoryStore = emptyStore();
    memoryOnly = true;
}

module.exports = {
    learnFromPublicPage,
    recordCorrectionCandidate,
    getLearningStatus,
    __extractTopicClaims: extractTopicClaims,
    __resetForTests: resetForTests
};
