'use strict';
const { rankKnowledgeChunks, formatKnowledgeContext } = require('./knowledgeRetrieval');
const library = require('../data/knowledge-library.json');
const DEFAULT_ORIGIN = 'https://indicator-web-chat.onrender.com';
function getPublicKnowledge(tenantId, requestOrigin, pageUrl, query) {
    if (tenantId !== 'demo') return '';
    let origin;
    try {
        origin = new URL(process.env.RENDER_EXTERNAL_URL || DEFAULT_ORIGIN).origin;
        if (requestOrigin !== origin || new URL(pageUrl).origin !== origin) return '';
    } catch (_) { return ''; }
    return formatKnowledgeContext(rankKnowledgeChunks(library.chunks.map(chunk => ({ ...chunk, url: new URL(chunk.url, origin).href })), query));
}
module.exports = { getPublicKnowledge };
