// Chat API Handler

const { createClient } = require('@supabase/supabase-js');
const { semanticCache } = require('../services/cache');
const { getRagContext } = require('../services/rag');
const indicatorAI = require('../services/ai/gateway');
const memoryManager = require('../services/memory');
const toolRegistry = require('../services/tools/registry');
const { generateRequestId, logEvent } = require('../services/ai/logger');
const { runIndicatorAgent } = require('../services/indicatorAgent');
const { resolveSiteProfile, originIsAllowed } = require('../services/siteProfiles');
const { learnPublicPage, getSiteKnowledge, getExpertiseStatus } = require('../services/siteExpertise');
const { learnFromPublicPage } = require('../services/knowledgeLearning');
const { research: researchExternal } = require('../services/externalResearch');
const { enabled: intelligenceEnabled, answerWithIntelligence } = require('../services/intelligenceBridge');
const { maskPII, maskDOMSnapshot } = require('../services/safety');
const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

const MAX_PROMPT_CHARS = 1200;
const MAX_PAGE_CHARS = 6000;
const MAX_SELECTED_CHARS = 1200;
const MAX_HISTORY_ITEMS = 8;

// "owned" is the default: it uses the provider-independent INDICATOR Agent.
// Set INDICATOR_AGENT_MODE=legacy only as an explicit rollback switch.
function usesIndicatorAgent() {
    return String(process.env.INDICATOR_AGENT_MODE || 'owned').toLowerCase() !== 'legacy';
}

// Using centralized CORS service

function parseBody(body) {
    if (!body) return {};
    if (typeof body === "string") { try { return JSON.parse(body); } catch { return {}; } }
    return body;
}

function cleanText(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const LOCALE_LABELS = { th: "ภาษาไทย", en: "English", zh: "中文", ja: "日本語" };
function normalizeLocale(value) {
    let code = cleanText(typeof value === "string" ? value : "", 10).toLowerCase().split("-")[0];
    return Object.prototype.hasOwnProperty.call(LOCALE_LABELS, code) ? code : "en";
}

function maskHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.slice(-MAX_HISTORY_ITEMS).map(item => {
        return { role: item && item.role === "assistant" ? "assistant" : "user", text: maskPII(cleanText(item && item.text, 1000)) };
    }).filter(item => item.text);
}

function sanitizeDNA(dna) {
    if (!dna || typeof dna !== "object") return {};
    let result = {};
    if (typeof dna.title === "string") result.title = maskPII(dna.title.slice(0, 200));
    if (typeof dna.metaDescription === "string") result.metaDescription = maskPII(dna.metaDescription.slice(0, 500));
    if (typeof dna.metaKeywords === "string") result.metaKeywords = maskPII(dna.metaKeywords.slice(0, 500));
    if (Array.isArray(dna.headings)) result.headings = dna.headings.map(h => maskPII(String(h).slice(0, 200))).slice(0, 5);
    // Product-heavy pages often render far more than ten public cards. Keep
    // enough titles for an in-page product request before falling back to a
    // whole-site crawl, while still bounding the browser payload.
    if (Array.isArray(dna.entities)) result.entities = dna.entities.map(h => maskPII(String(h).slice(0, 240))).slice(0, 80);
    if (typeof dna.lang === "string") result.lang = dna.lang.slice(0, 10);
    if (typeof dna.ogType === "string") result.ogType = dna.ogType.slice(0, 100);
    if (typeof dna.activeSectionTag === "string") result.activeSectionTag = dna.activeSectionTag.slice(0, 50);
    if (typeof dna.activeSectionType === "string") result.activeSectionType = dna.activeSectionType.slice(0, 50);
    if (typeof dna.activeSectionText === "string") result.activeSectionText = maskPII(dna.activeSectionText.slice(0, 1000));
    return result;
}

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    if (!checkRateLimit(req, res, 'chat')) {
        return; // checkRateLimit already sent the 429 response
    }

    try {
        const body = parseBody(req.body);

        // API Key Validation (Package & Expiry Control)
        let tenantInfo = null;
        let isValid = true;
        let tenantError = "";

        if (body.apiKey && body.apiKey !== 'INDICATOR_TEST') {
            try {
                if (supabase) {
                    const { data, error } = await supabase
                        .from('tenants')
                        .select('id, company_name, api_key, status, package_type, expires_at')
                        .eq('api_key', body.apiKey)
                        .limit(1)
                        .maybeSingle();

                    if (data) {
                        tenantInfo = data;
                        if (data.status === 'suspended') {
                            isValid = false;
                            tenantError = "บัญชีถูกระงับการใช้งาน (Suspended)";
                        } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
                            isValid = false;
                            tenantError = "Package หมดอายุ (Expired) กรุณาต่ออายุเพื่อใช้งานต่อ";
                        }
                    }
                }
            } catch (err) {
                console.error("Tenant validation error:", err);
            }
        }

        if (!isValid) {
            try {
                if (supabase) {
                    await supabase.from('logs').insert({
                        type: 'warn',
                        message: `Blocked chat request: ${tenantError}`,
                        metadata: { apiKeyPrefix: (body.apiKey || '').slice(0, 12) + '...' }
                    });
                }
            } catch (_) {}

            return res.status(403).json({
                status: "blocked",
                reply: tenantError,
                error: tenantError,
                interactive: null,
                action: { type: "disable_widget" }
            });
        }

        if (supabase && tenantInfo) {
            supabase.from('logs').insert({
                type: 'info',
                message: `Chat request from ${tenantInfo.company_name || tenantInfo.id}`,
                metadata: { tenantId: tenantInfo.id }
            }).then().catch(() => {});
        }

        const rawPrompt = cleanText(body.prompt, MAX_PROMPT_CHARS);
        // A browser key selects only a public site profile.  It never grants
        // admin or connector permissions; those must remain server-side.
        const siteProfile = resolveSiteProfile(cleanText(body.siteKey || body.apiKey, 300));
        if (process.env.INDICATOR_STRICT_SITE_ORIGIN === 'true' && req.headers.origin && !originIsAllowed(siteProfile, req.headers.origin)) {
            return res.status(403).json({
                status: 'blocked',
                reply: 'เว็บไซต์นี้ไม่ได้รับอนุญาตให้ใช้ Agent โปรไฟล์นี้',
                cssCommand: '',
                action: null,
                interactive: null
            });
        }

        const requestId = generateRequestId();

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
            siteProfile
        };

        if (!rawPrompt && !payload.isProactive) {
            return res.status(400).json({ error: "กรุณาพิมพ์ข้อความก่อนส่ง" });
        }

        // Each approved website has a strictly separate, public knowledge
        // notebook.  It learns the current public page only; DOM snapshots,
        // query strings, cookies, and private routes are never persisted.
        // This lets the Agent become better at that site over time without
        // turning browser traffic into unreviewed model-training data.
        payload.expertiseStatus = learnPublicPage(siteProfile, payload);
        payload.expertKnowledge = getSiteKnowledge(siteProfile);
        if (!payload.expertiseStatus) payload.experti        // 2. Fetch or update server memory context
        const conversationId = payload.conversationId || requestId;
        
        if (payload.prompt && !payload.isProactive) {
            await memoryManager.addMessage(conversationId, 'user', payload.prompt);
        }
        
        const mergedHistory = await memoryManager.getMergedHistory(conversationId, payload.history);

        // 3. Obtain RAG Context (Now supports provider agnostic rewriting internally)
        payload.ragContext = "";
        if (rawPrompt && supabase) {
            const ragTenantId = tenantInfo ? tenantInfo.id : 'demo';
            // We still pass GEMINI_API_KEY if available for embeddings, but local alternatives can be added
            payload.ragContext = await getRagContext(supabase, ragTenantId, rawPrompt, process.env.GEMINI_API_KEY);
        }

        let cached = semanticCache.get(payload);
        if (cached) {
            console.log("[Cache] HIT — returning cached response");
            return res.status(200).json({ ...cached, expertise: payload.expertiseStatus, learning: payload.learningStatus });
        }

        let result;
        if (usesIndicatorAgent()) {
            const identity = {
                name: 'INDICATOR',
                role: 'Website Assistant',
                purpose: 'Help users navigate the site and find products.'
            };
            
            // 1. Triple-Agent Pipeline: Brain Agent (GPT) analyzes first with RAG data
            const aiResponse = await indicatorAI.generate({
                identity,
                memory: mergedHistory,
                ragContext: payload.ragContext,
                tools: toolRegistry.getAvailableTools(),
                userMessage: payload.prompt,
                pageContent: payload.pageContent,
                siteDNA: payload.siteDNA,
                metadata: { requestId }
            });
            
            // 2. Execute Tools if Brain Agent requested one
            let toolResult = null;
            if (aiResponse.action && aiResponse.action.type) {
                try {
                    toolResult = await toolRegistry.execute(aiResponse.action.type, aiResponse.action, payload);
                } catch (err) {
                    console.error("[Triple-Agent] Tool execution failed:", err);
                }
            }

            // 3. Pipeline Check: Did the tool trigger the Scroller Action Agent?
            if (toolResult && toolResult.actionTrigger) {
                console.log(`[Triple-Agent] Brain delegated to Scroller. Target: ${toolResult.target}`);
                
                // Pass GPT's exact keyword command to the deterministic Scroller Agent
                const scrollerPayload = { ...payload, prompt: toolResult.target };
                let draft = runIndicatorAgent(scrollerPayload);
                
                if (draft && draft.researchRequest) {
                    const externalResearch = await researchExternal(draft.researchRequest);
                    draft = runIndicatorAgent({ ...scrollerPayload, externalResearch });
                }
                
                result = {
                    ...draft,
                    // If GPT provided a conversational reply along with the command, use it, otherwise use Scroller's default
                    reply: (aiResponse.reply && aiResponse.reply.trim() !== '') ? aiResponse.reply : draft.reply,
                    status: draft.status || 'ok'
                };
            } else {
                // 3. Just chat/reasoning from the Brain
                result = aiResponse;
                
                // Safe fallback: If AI failed completely, fallback to basic agent
                if (result.status === 'error') {
                    result = runIndicatorAgent(payload);
                }
            }
            
            if (result && Object.prototype.hasOwnProperty.call(result, 'researchRequest')) delete result.researchRequest;
        } else {
            // Legacy mode is now unified via the Gateway too but skips deterministic agent
            const identity = { name: 'INDICATOR', role: 'Website Assistant', purpose: 'Help users.' };
            result = await indicatorAI.generate({
                identity,
                memory: mergedHistory,
                ragContext: payload.ragContext,
                tools: toolRegistry.getAvailableTools(),
                userMessage: payload.prompt,
                pageContent: payload.pageContent,
                siteDNA: payload.siteDNA,
                metadata: { requestId }
            });
        }
        
        // Save assistant reply to memory
        if (result && result.reply && result.status !== "error") {
            await memoryManager.addMessage(conversationId, 'assistant', result.reply);
        }

        if (result && result.status !== "silent_abort") {
            result.expertise = payload.expertiseStatus;
            result.learning = payload.learningStatus;
            semanticCache.set(payload, result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error("Fatal handler error:", error);
        return res.status(200).json({
            reply: "⚡ ระบบ AI กำลังอัปเดต รบกวนลองอีกครั้งสักครู่นะครับ",
            cssCommand: "",
            action: null,
            interactive: null,
            status: "error"
        });
    }
};

module.exports.cacheStats = function (req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(semanticCache.stats());
};
