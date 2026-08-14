// Chat API Handler

const { createClient } = require('@supabase/supabase-js');
const { semanticCache } = require('../services/cache');
const { getRagContext } = require('../services/rag');
const { multiAgentPipeline } = require('../services/llm');
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
    if (Array.isArray(dna.entities)) result.entities = dna.entities.map(h => maskPII(String(h).slice(0, 200))).slice(0, 10);
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
            locale: normalizeLocale(body.locale)
        };

        if (!rawPrompt && !payload.isProactive) {
            return res.status(400).json({ error: "กรุณาพิมพ์ข้อความก่อนส่ง" });
        }

        // ✅ FIX 9: RAG Context Retrieval ทำงานสำหรับ Demo users ด้วย
        payload.ragContext = "";
        if (rawPrompt && supabase && process.env.GEMINI_API_KEY) {
            const ragTenantId = tenantInfo ? tenantInfo.id : 'demo';
            payload.ragContext = await getRagContext(supabase, ragTenantId, rawPrompt, process.env.GEMINI_API_KEY);
        }

        let cached = semanticCache.get(payload);
        if (cached) {
            console.log("[Cache] HIT — returning cached response");
            return res.status(200).json(cached);
        }

        const result = await multiAgentPipeline(payload);

        if (result && result.status !== "silent_abort") {
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