'use strict';

const { resolveSiteProfile, originIsAllowed } = require('../services/siteProfiles');
const { learnPublicPage } = require('../services/siteExpertise');
const { maskPII } = require('../services/safety');
const { setCorsHeaders } = require('../services/cors');

const MAX_PAGE_CHARS = 6000;

function parseBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch (_) { return {}; }
    }
    return typeof body === 'object' ? body : {};
}

function cleanText(value, max) {
    return typeof value === 'string' ? maskPII(value.replace(/\s+/g, ' ').trim().slice(0, max)) : '';
}

function cleanDna(value) {
    const dna = value && typeof value === 'object' ? value : {};
    return {
        title: cleanText(dna.title, 200),
        headings: Array.isArray(dna.headings) ? dna.headings.map(item => cleanText(String(item), 200)).filter(Boolean).slice(0, 12) : [],
        entities: Array.isArray(dna.entities) ? dna.entities.map(item => cleanText(String(item), 200)).filter(Boolean).slice(0, 30) : [],
        activeSectionText: cleanText(dna.activeSectionText, 1000)
    };
}

module.exports = async function learnHandler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = parseBody(req.body);
    const profile = resolveSiteProfile(cleanText(body.siteKey || body.apiKey, 300));
    if (!profile) return res.status(403).json({ status: 'blocked', error: 'Unknown site profile' });
    if (process.env.INDICATOR_STRICT_SITE_ORIGIN === 'true' && req.headers.origin && !originIsAllowed(profile, req.headers.origin)) {
        return res.status(403).json({ status: 'blocked', error: 'Site origin is not approved for this profile' });
    }

    const status = learnPublicPage(profile, {
        url: cleanText(body.url, 500),
        title: cleanText(body.title, 200),
        pageContent: cleanText(body.pageContent, MAX_PAGE_CHARS),
        siteDNA: cleanDna(body.siteDNA)
    });
    return res.status(200).json({ status: 'ok', expertise: status });
};
