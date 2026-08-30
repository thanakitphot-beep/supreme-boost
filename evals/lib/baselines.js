'use strict';

function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value) {
    return [...new Set(normalize(value).split(/\s+/u).filter(token => token.length > 1))];
}

function abstain() {
    return { reply: 'Insufficient evidence.', status: 'defer', action: null, sources: [] };
}

function lexical(testCase) {
    const query = tokens(testCase.input.message);
    const records = [
        ...(testCase.input.catalog || []).map(item => ({
            id: item.id,
            type: 'catalog',
            title: item.title,
            text: [item.title, item.price, item.description, item.text].filter(Boolean).join(' '),
            url: item.href || ''
        })),
        ...(testCase.input.documents || []).map(item => ({
            id: item.id,
            type: 'tenant_knowledge',
            title: item.title,
            text: [item.title, item.content].filter(Boolean).join(' '),
            url: item.source || ''
        }))
    ];
    const ranked = records.map(record => ({
        record,
        score: query.reduce((score, token) => score + (normalize(record.text).includes(token) ? 1 : 0), 0)
    })).sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (!best || best.score === 0) return abstain();
    return {
        reply: best.record.text,
        status: 'ok',
        action: null,
        sources: [{ type: best.record.type, id: best.record.id, title: best.record.title, url: best.record.url }]
    };
}

module.exports = { abstain, lexical, normalize, tokens };
