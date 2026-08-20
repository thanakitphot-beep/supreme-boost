'use strict';

// INDICATOR WEB CHAT — Chat API Handler
// Accuracy-first pipeline for main.js structured entityIndex + indicatorAgent.js.

const { createClient } = require('@supabase/supabase-js');
const { semanticCache } = require('../services/cache');
const { getRagContext } = require('../services/rag');
const indicatorAI = require('../services/ai/gateway');
const memoryManager = require('../services/memory');
const toolRegistry = require('../services/tools/registry');
const { generateRequestId, logEvent } = require('../services/ai/logger');
const { runIndicatorAgent, intentFor } = require('../services/indicatorAgent');
const { resolveSiteProfile, originIsAllowed } = require('../services/siteProfiles');
const { learnPublicPage, getSiteKnowledge, getExpertiseStatus } = require('../services/siteExpertise');
const { learnFromPublicPage } = require('../services/knowledgeLearning');
const { research: researchExternal } = require('../services/externalResearch');
const { enabled: intelligenceEnabled, answerWithIntelligence } = require('../services/intelligenceBridge');
const { maskPII, maskDOMSnapshot } = require('../services/safety');
const { checkRateLimit } = require('../services/rateLimit');
const { applyPluginCors, authorizePluginRequest } = require('../services/tenantAccess');
const { connectToDatabase } = require('./_mongodb');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

const MAX_PROMPT_CHARS = 1200;
const MAX_PAGE_CHARS = 12000;
const MAX_SELECTED_CHARS = 1200;
const MAX_HISTORY_ITEMS = 8;
const MAX_ENTITY_ITEMS = 120;
const MAX_ENTITY_TEXT = 700;
const MAX_ENTITY_DESCRIPTION = 600;
const MAX_BRAIN_PAGE_CHARS = 5000;
const MAX_BRAIN_ENTITY_ITEMS = 30;

const GROUNDED_INTENTS = new Set([
    'recommend_products',
    'search_unified',
    'find_product',
    'find_content',
    'define_term',
    'summarize',
    'complaint',
    'handoff'
]);

// "owned" is the default: provider-independent resolver is authoritative
// for website facts/actions. Set INDICATOR_AGENT_MODE=legacy only as rollback.
function usesIndicatorAgent() {
    return String(process.env.INDICATOR_AGENT_MODE || 'owned').toLowerCase() !== 'legacy';
}

function parseBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try { return JSON.parse(body); } catch (_) { return {}; }
    }
    return body;
}

function cleanText(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanOptionalText(value, maxLength) {
    return cleanText(typeof value === 'string' ? value : '', maxLength);
}

function knowledgeScore(query, chunk) {
    const terms = cleanText(query, 300).toLowerCase().split(/\s+/).filter(term => term.length > 2);
    const haystack = `${chunk.title || ''} ${chunk.source || ''} ${chunk.content || ''}`.toLowerCase();
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

async function getTenantKnowledgeContext(tenantId, query) {
    if (!tenantId || tenantId === 'demo' || !query) return '';
    const db = await connectToDatabase();
    if (!db) return '';
    const chunks = await db.collection('knowledge_chunks').find({ tenant_id: tenantId }).sort({ created_at: -1 }).limit(50).toArray();
    return chunks
        .map(chunk => ({ chunk, score: knowledgeScore(query, chunk) }))
        .filter(item => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 5)
        .map(item => `[Source: ${item.chunk.title || item.chunk.source || 'Tenant knowledge'}]\n${cleanText(item.chunk.content, 1600)}`)
        .join('\n\n');
}

async function logTenantEvent(tenantId, type, message, metadata = {}) {
    if (!tenantId || tenantId === 'demo') return;
    const db = await connectToDatabase();
    if (!db) return;
    await db.collection('logs').insertOne({
        id: generateRequestId(),
        type,
        message: cleanText(message, 500),
        metadata: { tenantId, ...metadata },
        timestamp: new Date().toISOString()
    });
}

const LOCALE_LABELS = {
    th: 'ภาษาไทย',
    en: 'English',
    zh: '中文',
    ja: '日本語'
};

function normalizeLocale(value) {
    const code = cleanText(typeof value === 'string' ? value : '', 10)
        .toLowerCase()
        .split('-')[0];
    return Object.prototype.hasOwnProperty.call(LOCALE_LABELS, code) ? code : 'en';
}

function maskHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
        .slice(-MAX_HISTORY_ITEMS)
        .map(item => ({
            role: item && item.role === 'assistant' ? 'assistant' : 'user',
            text: maskPII(cleanText(item && item.text, 1000))
        }))
        .filter(item => item.text);
}

function safeEntityId(value) {
    const id = cleanText(typeof value === 'string' ? value : '', 160);
    return /^[a-zA-Z0-9_.:-]{1,160}$/.test(id) ? id : '';
}

function canonicalEntitySelector(entityId) {
    if (!entityId) return '';
    return `[data-sb-entity-id="${entityId}"]`;
}

function sanitizeEntity(entity, index) {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return null;

    const id = safeEntityId(entity.id) || `visible-structured-${index + 1}`;
    const title = maskPII(cleanOptionalText(entity.title || entity.name || entity.label, 220));
    if (!title) return null;

    let price = null;
    if (Number.isFinite(entity.price)) {
        price = Number(entity.price);
    } else if (typeof entity.price === 'string') {
        price = maskPII(cleanText(entity.price, 80));
    }

    return {
        id,
        title,
        price,
        description: maskPII(cleanOptionalText(entity.description || entity.desc, MAX_ENTITY_DESCRIPTION)),
        href: cleanOptionalText(entity.href || entity.url, 500),
        image: cleanOptionalText(entity.image, 500),
        alt: maskPII(cleanOptionalText(entity.alt, 180)),
        text: maskPII(cleanOptionalText(entity.text, MAX_ENTITY_TEXT)),
        type: cleanOptionalText(entity.type, 80),
        // Never accept an arbitrary selector from the browser. Rebuild the
        // exact selector from the validated entity id instead.
        selector: canonicalEntitySelector(id),
        inStock: entity.inStock === true ? true : entity.inStock === false ? false : null
    };
}

function sanitizeDNA(dna) {
    if (!dna || typeof dna !== 'object') return {};

    const result = {};

    if (typeof dna.title === 'string') {
        result.title = maskPII(dna.title.slice(0, 200));
    }
    if (typeof dna.metaDescription === 'string') {
        result.metaDescription = maskPII(dna.metaDescription.slice(0, 500));
    }
    if (typeof dna.metaKeywords === 'string') {
        result.metaKeywords = maskPII(dna.metaKeywords.slice(0, 500));
    }
    if (Array.isArray(dna.headings)) {
        result.headings = dna.headings
            .map(value => maskPII(String(value).slice(0, 220)))
            .filter(Boolean)
            .slice(0, 12);
    }

    // Backward-compatible plain entity strings.
    if (Array.isArray(dna.entities)) {
        result.entities = dna.entities
            .map(value => maskPII(String(value).slice(0, 300)))
            .filter(Boolean)
            .slice(0, MAX_ENTITY_ITEMS);
    }

    // NEW: Preserve main.js structured entity index all the way to the Agent.
    if (Array.isArray(dna.entityIndex)) {
        result.entityIndex = dna.entityIndex
            .slice(0, MAX_ENTITY_ITEMS)
            .map(sanitizeEntity)
            .filter(Boolean);
        result.entityCount = result.entityIndex.length;
    } else if (Number.isFinite(dna.entityCount)) {
        result.entityCount = Math.max(0, Math.min(Number(dna.entityCount), MAX_ENTITY_ITEMS));
    }

    if (Array.isArray(dna.dataPoints)) {
        result.dataPoints = dna.dataPoints
            .map(value => maskPII(String(value).slice(0, 200)))
            .filter(Boolean)
            .slice(0, 20);
    }

    if (typeof dna.lang === 'string') result.lang = dna.lang.slice(0, 10);
    if (typeof dna.ogType === 'string') result.ogType = dna.ogType.slice(0, 100);
    if (typeof dna.activeSectionTag === 'string') result.activeSectionTag = dna.activeSectionTag.slice(0, 50);
    if (typeof dna.activeSectionType === 'string') result.activeSectionType = dna.activeSectionType.slice(0, 50);
    if (typeof dna.activeSectionText === 'string') {
        result.activeSectionText = maskPII(dna.activeSectionText.slice(0, 1400));
    }
    if (typeof dna.geoContext === 'string') {
        result.geoContext = maskPII(dna.geoContext.slice(0, 160));
    }

    return result;
}

function normalizeResult(result) {
    const source = result && typeof result === 'object' ? result : {};
    return {
        ...source,
        reply: typeof source.reply === 'string' ? source.reply : '',
        cssCommand: typeof source.cssCommand === 'string' ? source.cssCommand : '',
        action: source.action && typeof source.action === 'object' ? source.action : null,
        interactive: source.interactive && typeof source.interactive === 'object' ? source.interactive : null,
        status: cleanOptionalText(source.status || 'ok', 40) || 'ok'
    };
}

function dynamicEntityRequest(payload) {
    return Boolean(
        payload &&
        payload.siteDNA &&
        Array.isArray(payload.siteDNA.entityIndex) &&
        payload.siteDNA.entityIndex.length
    );
}

// Cached actions can become stale when the DOM/catalog changes, especially now
// that actions contain exact entity IDs. Keep dynamic entity requests live.
function cacheEligible(payload) {
    if (!payload || payload.isProactive) return false;
    if (dynamicEntityRequest(payload)) return false;
    return true;
}

function appendBrainContext(payload) {
    const parts = [];

    if (payload.ragContext) {
        parts.push(String(payload.ragContext).slice(0, 6000));
    }

    if (payload.pageContent) {
        parts.push(`CURRENT PUBLIC PAGE:\n${payload.pageContent.slice(0, MAX_BRAIN_PAGE_CHARS)}`);
    }

    const index = payload.siteDNA && Array.isArray(payload.siteDNA.entityIndex)
        ? payload.siteDNA.entityIndex
        : [];

    if (index.length) {
        const compact = index.slice(0, MAX_BRAIN_ENTITY_ITEMS).map(item => {
            const price = item.price === null || item.price === undefined || item.price === ''
                ? ''
                : ` | price=${item.price}`;
            const description = item.description ? ` | ${item.description.slice(0, 180)}` : '';
            return `- ${item.title}${price}${description}`;
        });
        parts.push(`VISIBLE VERIFIED ENTITIES:\n${compact.join('\n')}`);
    }

    return parts.join('\n\n').slice(0, 12000);
}

function isGroundedIntent(intent) {
    return GROUNDED_INTENTS.has(intent);
}

function resultIsGrounded(result) {
    if (!result || typeof result !== 'object') return false;
    if (result.status === 'blocked') return true;
    if (result.action) return true;
    if (Array.isArray(result.sources) && result.sources.length) return true;
    return false;
}

async function runAgentWithResearch(payload) {
    let draft = runIndicatorAgent(payload);

    if (draft && draft.researchRequest) {
        try {
            const externalResearch = await researchExternal(draft.researchRequest);
            draft = runIndicatorAgent({ ...payload, externalResearch });
        } catch (error) {
            logEvent('warn', 'External research enrichment failed', {
                error: error && error.message ? error.message : String(error)
            });
        }
    }

    if (draft && Object.prototype.hasOwnProperty.call(draft, 'researchRequest')) {
        delete draft.researchRequest;
    }

    return normalizeResult(draft);
}

function brainActionTarget(aiResponse, originalPrompt) {
    const action = aiResponse && aiResponse.action;
    if (!action || typeof action !== 'object') return '';

    return cleanText(
        action.target ||
        action.targetText ||
        action.title ||
        action.query ||
        action.label ||
        originalPrompt,
        MAX_PROMPT_CHARS
    );
}

function actionNeedsResolver(aiResponse) {
    const action = aiResponse && aiResponse.action;
    if (!action || typeof action !== 'object') return false;
    if (action.actionTrigger) return true;
    return ['warp', 'warp_cross_page', 'navigate', 'highlight'].includes(String(action.type || '').toLowerCase());
}

function safeBrainOnlyAction(action) {
    if (!action || typeof action !== 'object') return null;
    const type = String(action.type || '').toLowerCase();

    // Website search/navigation/highlight must always be resolved by our
    // deterministic Agent so answer + entity + DOM target stay synchronized.
    if (['warp', 'warp_cross_page', 'navigate', 'highlight'].includes(type)) return null;

    // Keep only existing widget actions that do not select page content.
    if (['handoff', 'speech', 'confetti', 'plugin_action'].includes(type)) return action;
    return null;
}

async function askBrain(payload, mergedHistory, requestId) {
    const identity = {
        name: 'INDICATOR',
        role: 'Website Assistant',
        purpose: 'Help users using verified public website information. Never invent a product or DOM target.'
    };

    return indicatorAI.generate({
        identity,
        memory: mergedHistory,
        ragContext: appendBrainContext(payload),
        tools: toolRegistry.getAvailableTools(),
        userMessage: payload.prompt,
        metadata: { requestId }
    });
}

async function runOwnedPipeline(payload, mergedHistory, requestId) {
    // Proactive hover/behavior prompts are generated by main.js and are meant
    // to sound natural. They do not need catalog routing unless the Brain tries
    // to trigger a page action.
    if (payload.isProactive) {
        const aiResponse = normalizeResult(await askBrain(payload, mergedHistory, requestId));
        if (actionNeedsResolver(aiResponse)) {
            const target = brainActionTarget(aiResponse, payload.prompt);
            const resolved = await runAgentWithResearch({ ...payload, prompt: target });
            if (resolved.action) return resolved;
        }
        return {
            ...aiResponse,
            action: safeBrainOnlyAction(aiResponse.action)
        };
    }

    // 1) Resolve the user's real website intent FIRST. This is the source of
    // truth for products, pages, prices, navigation and Warp targets.
    const intent = intentFor(payload.prompt);
    const deterministic = await runAgentWithResearch(payload);

    if (isGroundedIntent(intent) || resultIsGrounded(deterministic)) {
        return deterministic;
    }

    // If the deterministic agent already produced a meaningful reply
    // (e.g. greetings, fallback), skip the Brain call entirely to avoid
    // showing AI error messages when provider keys are missing/overloaded.
    if (deterministic.reply && deterministic.status === 'ok') {
        return deterministic;
    }

    // 2) Optional intelligence service for general grounded reasoning. It may
    // improve answers, but it is never allowed to overrule a deterministic
    // product/page action selected above.
    if (intelligenceEnabled()) {
        try {
            const intelligent = await answerWithIntelligence(payload);
            if (intelligent && intelligent.reply) {
                const normalized = normalizeResult(intelligent);
                if (actionNeedsResolver(normalized)) {
                    const target = brainActionTarget(normalized, payload.prompt);
                    const resolved = await runAgentWithResearch({ ...payload, prompt: target });
                    if (resolved.action) return resolved;
                    normalized.action = null;
                }
                return normalized;
            }
        } catch (error) {
            logEvent('warn', 'Intelligence bridge failed; continuing with Brain', {
                requestId,
                error: error && error.message ? error.message : String(error)
            });
        }
    }

    // 3) General conversation/reasoning goes to the provider gateway.
    let aiResponse;
    try {
        aiResponse = normalizeResult(await askBrain(payload, mergedHistory, requestId));
    } catch (error) {
        logEvent('warn', 'Brain call threw unexpectedly; returning deterministic', {
            requestId,
            error: error && error.message ? error.message : String(error)
        });
        return deterministic;
    }

    if (actionNeedsResolver(aiResponse)) {
        const target = brainActionTarget(aiResponse, payload.prompt);
        const resolved = await runAgentWithResearch({ ...payload, prompt: target });
        if (resolved.action) {
            // Do NOT reuse the Brain's prose here: the deterministic reply is
            // tied to the same verified entity/page as the action.
            return resolved;
        }
        aiResponse.action = null;
    } else {
        aiResponse.action = safeBrainOnlyAction(aiResponse.action);
    }

    // Safe fallback if model provider failed.
    if (aiResponse.status === 'error' || !aiResponse.reply) {
        return deterministic;
    }

    return aiResponse;
}

async function validateTenant(body, origin) {
    const access = await authorizePluginRequest({ apiKey: body.apiKey, origin });
    if (access.error) return { tenantInfo: null, isValid: false, tenantError: access.error };
    return { tenantInfo: access.tenant, isValid: true, tenantError: '' };
}

async function handler(req, res) {
    if (!await applyPluginCors(req, res)) return res.status(403).json({ error: 'Origin is not allowed' });

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!req._rateLimitChecked && !checkRateLimit(req, res, 'chat')) {
        return;
    }

    try {
        const body = parseBody(req.body);
        const tenant = await validateTenant(body, req.headers.origin);

        if (!tenant.isValid) {
            try {
                if (supabase) {
                    await supabase.from('logs').insert({
                        type: 'warn',
                        message: `Blocked chat request: ${tenant.tenantError}`,
                        metadata: { apiKeyPrefix: (body.apiKey || '').slice(0, 12) + '...' }
                    });
                }
            } catch (_) { }

            return res.status(403).json({
                status: 'blocked',
                reply: tenant.tenantError,
                error: tenant.tenantError,
                interactive: null,
                action: { type: 'disable_widget' }
            });
        }

        const rawPrompt = cleanText(body.prompt, MAX_PROMPT_CHARS);
        const siteProfile = resolveSiteProfile(cleanText(body.siteKey || body.apiKey, 300));

        if (
            process.env.INDICATOR_STRICT_SITE_ORIGIN === 'true' &&
            req.headers.origin &&
            !originIsAllowed(siteProfile, req.headers.origin)
        ) {
            return res.status(403).json({
                status: 'blocked',
                reply: 'เว็บไซต์นี้ไม่ได้รับอนุญาตให้ใช้ Agent โปรไฟล์นี้',
                cssCommand: '',
                action: null,
                interactive: null
            });
        }

        const requestId = generateRequestId();
        const tenantId = tenant.tenantInfo && tenant.tenantInfo.id || 'demo';
        logTenantEvent(tenantId, 'chat', `Chat request from ${tenant.tenantInfo && (tenant.tenantInfo.company_name || tenantId) || tenantId}`, { requestId }).catch(() => { });
        const payload = {
            prompt: maskPII(rawPrompt),
            isProactive: body.proactive === true,
            domSnapshot: maskDOMSnapshot(body.domSnapshot),
            siteDNA: sanitizeDNA(body.siteDNA),
            pageContent: maskPII(cleanText(body.pageContent, MAX_PAGE_CHARS)),
            selectedText: maskPII(cleanText(body.selectedText, MAX_SELECTED_CHARS)),
            history: maskHistory(body.history),
            url: cleanText(body.url, 500),
            title: maskPII(cleanText(body.title, 200)),
            locale: normalizeLocale(body.locale),
            conversationId: cleanText(body.conversationId, 120),
            tenantId,
            siteProfile
        };

        if (!rawPrompt && !payload.isProactive) {
            return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
        }

        // Learn only already-masked, public page information. These systems are
        // tenant/profile-separated and reject private routes internally.
        try {
            payload.expertiseStatus = learnPublicPage(siteProfile, payload);
        } catch (error) {
            logEvent('warn', 'Site expertise learning failed', {
                requestId,
                error: error && error.message ? error.message : String(error)
            });
            payload.expertiseStatus = getExpertiseStatus(siteProfile);
        }

        try {
            payload.learningStatus = learnFromPublicPage(siteProfile, payload);
        } catch (error) {
            logEvent('warn', 'Knowledge learning failed', {
                requestId,
                error: error && error.message ? error.message : String(error)
            });
            payload.learningStatus = null;
        }

        payload.expertKnowledge = getSiteKnowledge(siteProfile);

        const conversationId = `${tenantId}:${payload.conversationId || requestId}`;
        const mergedHistory = (await memoryManager.getMergedHistory(
            conversationId,
            payload.history
        )).slice();

        if (payload.prompt && !payload.isProactive) {
            const last = mergedHistory[mergedHistory.length - 1];
            if (!last || last.role !== 'user' || last.text !== payload.prompt) {
                mergedHistory.push({ role: 'user', text: payload.prompt });
            }
            await memoryManager.addMessage(conversationId, 'user', payload.prompt);
        }

        payload.ragContext = await getTenantKnowledgeContext(tenantId, rawPrompt).catch(() => '');
        if (!payload.ragContext && rawPrompt && supabase) {
            const ragTenantId = tenantId;
            try {
                payload.ragContext = await getRagContext(
                    supabase,
                    ragTenantId,
                    rawPrompt,
                    process.env.GEMINI_API_KEY
                );
            } catch (error) {
                logEvent('warn', 'RAG lookup failed', {
                    requestId,
                    error: error && error.message ? error.message : String(error)
                });
                payload.ragContext = '';
            }
        }

        const allowCache = cacheEligible(payload);
        if (allowCache) {
            const cached = semanticCache.get(payload);
            if (cached) {
                console.log('[Cache] HIT — returning cached response');
                return res.status(200).json({
                    ...cached,
                    expertise: payload.expertiseStatus,
                    learning: payload.learningStatus
                });
            }
        }

        let result;

        if (usesIndicatorAgent()) {
            result = await runOwnedPipeline(payload, mergedHistory, requestId);
        } else {
            // Explicit rollback mode. Still append current public context to RAG
            // so legacy Brain has enough page information to answer safely.
            const identity = {
                name: 'INDICATOR',
                role: 'Website Assistant',
                purpose: 'Help users using public website information.'
            };

            result = normalizeResult(await indicatorAI.generate({
                identity,
                memory: mergedHistory,
                ragContext: appendBrainContext(payload),
                tools: toolRegistry.getAvailableTools(),
                userMessage: payload.prompt,
                metadata: { requestId }
            }));
        }

        result = normalizeResult(result);

        if (result.reply && result.status !== 'error' && result.status !== 'silent_abort') {
            await memoryManager.addMessage(conversationId, 'assistant', result.reply);
        }

        if (result.status !== 'silent_abort') {
            result.expertise = payload.expertiseStatus;
            result.learning = payload.learningStatus;
            result.metadata = {
                ...(result.metadata || {}),
                requestId,
                resolver: usesIndicatorAgent() ? 'indicator-agent' : 'legacy',
                structuredEntities: payload.siteDNA && Array.isArray(payload.siteDNA.entityIndex)
                    ? payload.siteDNA.entityIndex.length
                    : 0
            };

            if (allowCache) {
                semanticCache.set(payload, result);
            }
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('Fatal handler error:', error);
        return res.status(503).json({
            reply: 'ระบบตอบคำถามไม่พร้อมใช้งานชั่วคราว กรุณาลองอีกครั้งในอีกสักครู่',
            cssCommand: '',
            action: null,
            interactive: null,
            status: 'error'
        });
    }
}

module.exports = handler;

module.exports.cacheStats = function cacheStats(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(semanticCache.stats());
};

// Small private exports for contract tests/debugging without exposing them as
// public API routes.
module.exports.__sanitizeDNA = sanitizeDNA;
module.exports.__cacheEligible = cacheEligible;
