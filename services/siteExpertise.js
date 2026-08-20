'use strict';

/*
 * Tenant-scoped, public website knowledge collected by the INDICATOR widget.
 *
 * This is intentionally a small, deterministic store rather than a hidden
 * training system: it remembers only public page summaries supplied by an
 * approved site profile, keeps sites separate, and records no cookies,
 * credentials, DOM snapshots, or URL query strings.
 */

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'site-expertise.json');
const MAX_PAGES_PER_SITE = 80;
const MAX_CONTENT_CHARS = 6000;
const MAX_TITLE_CHARS = 200;
const MAX_HEADING_COUNT = 12;
const MAX_ENTITY_COUNT = 30;
const PRIVATE_PATH = /(?:^|\/)(?:admin|login|logout|sign[\-_]?in|account|profile|dashboard|checkout|payment|billing|auth|oauth|password|reset)(?:\/|$)/iu;
const PRIVATE_CONTEXT_PREFIX = '__indicator_context_product__:';

let inMemoryStore = null;

function filePersistenceEnabled() {
    return process.env.INDICATOR_FILE_LEARNING === 'true';
}

function safeText(value, max) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function emptyStore() {
    return { version: 1, sites: {} };
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
    if (!filePersistenceEnabled()) return;
    const directory = path.dirname(STORE_PATH);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(temporaryPath, STORE_PATH);
}

function profileId(profile) {
    return profile && typeof profile.id === 'string' && profile.id ? profile.id : null;
}

function approvedProfile(profile) {
    return Boolean(
        profileId(profile) &&
        Array.isArray(profile.permissions) &&
        profile.permissions.includes('search_public_content')
    );
}

function safePageUrl(value, origin) {
    try {
        const url = new URL(String(value || ''), origin || 'https://indicator.local');
        const expectedOrigin = origin ? new URL(origin).origin : url.origin;
        if (url.origin !== expectedOrigin || !/^https?:$/i.test(url.protocol)) return null;
        if (PRIVATE_PATH.test(url.pathname)) return null;
        // Queries can include search terms, account IDs, or other personal
        // data, so the knowledge key is always the public path + fragment.
        return `${url.pathname || '/'}${url.hash || ''}`;
    } catch (_) {
        return null;
    }
}

function publicOrigin(value) {
    try {
        const url = new URL(String(value || ''));
        return /^https?:$/i.test(url.protocol) ? url.origin : null;
    } catch (_) {
        return null;
    }
}

function uniqueStrings(values, max, maxLength) {
    const seen = new Set();
    const output = [];
    for (const value of Array.isArray(values) ? values : []) {
        const text = safeText(value, maxLength);
        const key = text.toLocaleLowerCase('th-TH');
        // A request-only dialogue marker must never be treated as published
        // website content or written into long-term site knowledge.
        if (text && !text.toLocaleLowerCase('th-TH').startsWith(PRIVATE_CONTEXT_PREFIX) && !seen.has(key)) {
            seen.add(key);
            output.push(text);
        }
        if (output.length >= max) break;
    }
    return output;
}

function pageFromPayload(payload = {}) {
    const origin = publicOrigin(payload.url);
    const url = safePageUrl(payload.url, origin);
    if (!origin || !url) return null;
    const dna = payload.siteDNA && typeof payload.siteDNA === 'object' ? payload.siteDNA : {};
    const title = safeText(payload.title || dna.title || 'หน้าสาธารณะ', MAX_TITLE_CHARS);
    const headings = uniqueStrings(dna.headings, MAX_HEADING_COUNT, 200);
    const entities = uniqueStrings(dna.entities, MAX_ENTITY_COUNT, 200);
    const content = safeText(payload.pageContent || dna.activeSectionText, MAX_CONTENT_CHARS);
    if (!title && !headings.length && !entities.length && !content) return null;
    return { origin, url, title, headings, entities, content };
}

function siteEntry(store, id, origin) {
    const existing = store.sites[id];
    if (existing && existing.origin === origin && Array.isArray(existing.pages)) return existing;
    const fresh = { origin, pages: [], updatedAt: null };
    store.sites[id] = fresh;
    return fresh;
}

/**
 * Saves one public page snapshot for the profile.  Callers must pass already
 * masked content; this module also rejects private routes as a defence in
 * depth layer.
 */
function learnPublicPage(profile, payload = {}) {
    if (!approvedProfile(profile)) return getExpertiseStatus(profile);
    const page = pageFromPayload(payload);
    if (!page) return getExpertiseStatus(profile);

    const store = readStore();
    const site = siteEntry(store, profile.id, page.origin);
    const now = new Date().toISOString();
    const index = site.pages.findIndex(item => item && item.url === page.url);
    const previous = index >= 0 ? site.pages[index] : null;
    const record = {
        ...page,
        firstLearnedAt: previous && previous.firstLearnedAt || now,
        lastLearnedAt: now,
        seenCount: Number(previous && previous.seenCount || 0) + 1
    };
    if (index >= 0) site.pages[index] = record;
    else site.pages.push(record);
    site.pages.sort((left, right) => String(right.lastLearnedAt).localeCompare(String(left.lastLearnedAt)));
    site.pages = site.pages.slice(0, MAX_PAGES_PER_SITE);
    site.updatedAt = now;
    saveStore(store);
    return getExpertiseStatus(profile);
}

function getSiteKnowledge(profile) {
    if (!approvedProfile(profile)) return { pages: [], catalog: [], glossary: [] };
    const site = readStore().sites[profile.id];
    if (!site || !Array.isArray(site.pages)) return { pages: [], catalog: [], glossary: [] };

    const pages = site.pages.map((page, index) => ({
        id: `learned-page-${index + 1}`,
        title: safeText(page.title, MAX_TITLE_CHARS),
        url: safePageUrl(page.url, site.origin) || '/',
        headings: uniqueStrings(page.headings, MAX_HEADING_COUNT, 200),
        content: safeText(page.content, MAX_CONTENT_CHARS),
        keywords: uniqueStrings([...(page.headings || []), ...(page.entities || [])], 24, 120),
        learned: true
    }));
    const catalog = [];
    for (const page of site.pages) {
        for (const entity of uniqueStrings(page.entities, MAX_ENTITY_COUNT, 200)) {
            catalog.push({
                id: `learned-entity-${catalog.length + 1}`,
                name: entity,
                description: `รายการที่เผยแพร่บนหน้า ${safeText(page.title, MAX_TITLE_CHARS) || 'เว็บไซต์'}`,
                // Page text alone is not proof of live stock or price.
                inStock: null,
                url: safePageUrl(page.url, site.origin) || '/',
                keywords: uniqueStrings([...(page.headings || []), entity], 8, 120),
                learned: true
            });
        }
    }
    return { pages, catalog, glossary: [] };
}

function getExpertiseStatus(profile) {
    if (!approvedProfile(profile)) return { enabled: false, pagesLearned: 0, lastLearnedAt: null };
    const site = readStore().sites[profile.id];
    return {
        enabled: true,
        pagesLearned: site && Array.isArray(site.pages) ? site.pages.length : 0,
        lastLearnedAt: site && site.updatedAt || null
    };
}

function resetForTests() {
    inMemoryStore = null;
}

module.exports = {
    learnPublicPage,
    getSiteKnowledge,
    getExpertiseStatus,
    // Kept private in normal use; useful for isolated contract tests.
    __resetForTests: resetForTests
};
