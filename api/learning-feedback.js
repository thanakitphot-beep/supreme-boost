'use strict';

const { resolveSiteProfile, originIsAllowed } = require('../services/siteProfiles');
const { recordCorrectionCandidate } = require('../services/knowledgeLearning');
const { maskPII } = require('../services/safety');
const { setCorsHeaders } = require('../services/cors');

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

module.exports = async function learningFeedbackHandler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ status: 'blocked', error: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = parseBody(req.body);
    const profile = resolveSiteProfile(cleanText(body.siteKey || body.apiKey, 300));
    if (!profile) return res.status(403).json({ status: 'blocked', error: 'Unknown site profile' });
    if (process.env.INDICATOR_STRICT_SITE_ORIGIN === 'true' && req.headers.origin && !originIsAllowed(profile, req.headers.origin)) {
        return res.status(403).json({ status: 'blocked', error: 'Site origin is not approved for this profile' });
    }

    const learning = recordCorrectionCandidate(profile, {
        url: cleanText(body.url, 500),
        question: cleanText(body.question, 500),
        correction: cleanText(body.correction, 800)
    });
    return res.status(200).json({ status: 'ok', learning });
};
