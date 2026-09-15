'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const cheerio = require('cheerio');
const { cleanSource, splitKnowledge } = require('../services/knowledgeIngestion');
const ROOT = path.resolve(__dirname, '..');
function buildLibrary() {
    const sources = [
        { file: 'index.html', url: '/', selector: '#features .feature-card, #pricing .pricing-card' },
        { file: 'knowledge-guide.html', url: '/knowledge-guide.html', selector: 'article[id]' }
    ];
    const chunks = [], sourceFiles = [];
    for (const source of sources) {
        const html = fs.readFileSync(path.join(ROOT, source.file), 'utf8');
        const hash = createHash('sha256').update(html).digest('hex');
        sourceFiles.push({ file: source.file, sha256: hash });
        const $ = cheerio.load(html);
        $(source.selector).each((index, el) => {
            const block = $(el).clone();
            block.find('script,style,form,input,button,textarea').remove();
            block.find('h1,h2,h3,p,li').append('\n');
            const title = cleanSource(block.find('h2,h3').first().text()).slice(0, 180);
            const id = $(el).attr('id') || `section-${index}`;
            const fragment = $(el).attr('id') || (source.file === 'index.html' ? 'features' : '');
            for (const [part, content] of splitKnowledge(block.text()).entries()) chunks.push({ id: `${source.file}:${id}:${part}`, title,
                url: source.url + (fragment ? '#' + fragment : ''), content, source_hash: hash, status: 'published', source_kind: 'bundled_public_page' });
        });
    }
    return { version: 1, scope: 'indicator-public-site-only', sources: sourceFiles, chunks };
}
if (require.main === module) {
    const library = buildLibrary();
    fs.writeFileSync(path.join(ROOT, 'data', 'knowledge-library.json'), JSON.stringify(library, null, 2) + '\n');
    console.log(`Prepared ${library.chunks.length} source-backed knowledge sections from ${library.sources.length} public pages; no model calls.`);
}
module.exports = { buildLibrary };
