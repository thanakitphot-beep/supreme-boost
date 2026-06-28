// ═══════════════════════════════════════════════════════════════════
// Triple-Brain Orchestration Matrix v6.1 (Upgraded Flexibility & Stability)
// ─── Parallel Processing | Dynamic Cross-Model Redundancy | Schema Determinism
// ═══════════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PROMPT_CHARS = 1200;
const MAX_PAGE_CHARS = 6000;
const MAX_SELECTED_CHARS = 1200;
const MAX_HISTORY_ITEMS = 8;

const UNIVERSAL_SAFETY_RULES = [
    "extracting personally identifiable information (PII — emails, phones, IDs, credit cards)",
    "submitting forms or triggering transactions without explicit user click",
    "redirecting to external domains or login pages",
    "injecting executable JavaScript, iframes, or active content",
    "accessing authentication tokens, session data, or password fields",
    "modifying security-sensitive page content (payment, login, admin areas)",
    "initiating downloads or file operations without user consent",
    "automating payment, checkout, or billing flows",
    "bypassing user consent for sensitive DOM operations"
];

const INDUSTRY_LABELS = {
    healthcare: "clinical advisor", "e-commerce": "shopping assistant",
    saas: "tech support", education: "academic tutor",
    blog: "content guide", real_estate: "property agent",
    finance: "financial advisor", entertainment: "entertainment guide",
    government: "public service assistant", other: "helpful assistant"
};

const INDUSTRY_TONES = {
    healthcare: "professional and empathetic",
    "e-commerce": "casual and helpful",
    saas: "technical and precise",
    education: "academic and encouraging",
    blog: "conversational and friendly",
    real_estate: "professional and informative",
    finance: "formal and trustworthy",
    entertainment: "fun and energetic",
    government: "formal and clear",
    other: "friendly and helpful"
};

const SUPER_AI_100_SKILLS = `YOU HAVE 100+ OMNIPOTENT SKILLS. You can execute them by returning the appropriate cssCommand or actionType!
Examples of what you can do (do NOT reply with this list, just do the action):
1. Enlarge text (cssCommand: "body * { font-size: 150% !important; }")
2. Shrink text (cssCommand: "body * { font-size: 80% !important; }")
3. Dark mode (cssCommand: "body { background: #121212 !important; color: white !important; }")
4. Light mode (cssCommand: "body { background: white !important; color: black !important; }")
5. Sepia mode (cssCommand: "body { background: #f4ecd8 !important; color: #5b4636 !important; }")
6. High contrast (cssCommand: "body { background: black !important; color: yellow !important; }")
7. Cyberpunk theme (cssCommand: "body { background: #0d0221 !important; color: #0f0 !important; }")
8. Ocean theme (cssCommand: "body { background: #006994 !important; color: white !important; }")
9. Forest theme (cssCommand: "body { background: #228b22 !important; color: white !important; }")
10. Sunset theme (cssCommand: "body { background: #ff4500 !important; color: white !important; }")
11. Matrix theme (cssCommand: "body { background: black !important; color: #00ff00 !important; font-family: monospace; }")
12. Hide all images (cssCommand: "img { display: none !important; }")
13. Show all images (cssCommand: "img { display: block !important; }")
14. Blur images (cssCommand: "img { filter: blur(5px); }")
15. Grayscale images (cssCommand: "img { filter: grayscale(100%); }")
16. Invert colors (cssCommand: "body { filter: invert(100%); }")
17. Highlight links (cssCommand: "a { background: yellow !important; color: black !important; }")
18. Underline links (cssCommand: "a { text-decoration: underline !important; }")
19. Remove link underlines (cssCommand: "a { text-decoration: none !important; }")
20. Change font to Serif (cssCommand: "body * { font-family: serif !important; }")
21. Change font to Sans-Serif (cssCommand: "body * { font-family: sans-serif !important; }")
22. Change font to Monospace (cssCommand: "body * { font-family: monospace !important; }")
23. Change font to Comic Sans (cssCommand: "body * { font-family: 'Comic Sans MS' !important; }")
24. Bold all text (cssCommand: "body * { font-weight: bold !important; }")
25. Italicize all text (cssCommand: "body * { font-style: italic !important; }")
26. Uppercase all text (cssCommand: "body * { text-transform: uppercase !important; }")
27. Lowercase all text (cssCommand: "body * { text-transform: lowercase !important; }")
28. Capitalize text (cssCommand: "body * { text-transform: capitalize !important; }")
29. Increase line height (cssCommand: "body * { line-height: 2 !important; }")
30. Decrease line height (cssCommand: "body * { line-height: 1 !important; }")
31. Increase letter spacing (cssCommand: "body * { letter-spacing: 2px !important; }")
32. Decrease letter spacing (cssCommand: "body * { letter-spacing: -1px !important; }")
33. Center align text (cssCommand: "body * { text-align: center !important; }")
34. Right align text (cssCommand: "body * { text-align: right !important; }")
35. Justify text (cssCommand: "body * { text-align: justify !important; }")
36. Add text shadow (cssCommand: "body * { text-shadow: 2px 2px 4px gray !important; }")
37. Add box shadow (cssCommand: "body * { box-shadow: 0 0 5px gray !important; }")
38. Round corners (cssCommand: "body * { border-radius: 10px !important; }")
39. Sharp corners (cssCommand: "body * { border-radius: 0 !important; }")
40. Add borders (cssCommand: "body * { border: 1px solid red !important; }")
41. Remove borders (cssCommand: "body * { border: none !important; }")
42. Rotate page (cssCommand: "body { transform: rotate(180deg); }")
43. Flip page horizontally (cssCommand: "body { transform: scaleX(-1); }")
44. Flip page vertically (cssCommand: "body { transform: scaleY(-1); }")
45. Make page transparent (cssCommand: "body { opacity: 0.5; }")
46. Zoom in (cssCommand: "body { zoom: 1.5; }")
47. Zoom out (cssCommand: "body { zoom: 0.8; }")
48. Wiggle effect (cssCommand: "@keyframes wiggle { 0% {transform: rotate(0deg);} 25% {transform: rotate(-5deg);} 50% {transform: rotate(0deg);} 75% {transform: rotate(5deg);} 100% {transform: rotate(0deg);} } body { animation: wiggle 0.5s infinite; }")
49. Shake effect (cssCommand: "@keyframes shake { 0% {transform: translate(1px, 1px) rotate(0deg);} 10% {transform: translate(-1px, -2px) rotate(-1deg);} 20% {transform: translate(-3px, 0px) rotate(1deg);} 30% {transform: translate(3px, 2px) rotate(0deg);} 40% {transform: translate(1px, -1px) rotate(1deg);} 50% {transform: translate(-1px, 2px) rotate(-1deg);} 60% {transform: translate(-3px, 1px) rotate(0deg);} 70% {transform: translate(3px, 1px) rotate(-1deg);} 80% {transform: translate(-1px, -1px) rotate(1deg);} 90% {transform: translate(1px, 2px) rotate(0deg);} 100% {transform: translate(1px, -2px) rotate(-1deg);} } body { animation: shake 0.5s infinite; }")
50. Pulse effect (cssCommand: "@keyframes pulse { 0% {transform: scale(1);} 50% {transform: scale(1.05);} 100% {transform: scale(1);} } body { animation: pulse 1s infinite; }")
51. Hide headers (cssCommand: "header { display: none !important; }")
52. Hide footers (cssCommand: "footer { display: none !important; }")
53. Hide sidebars (cssCommand: "aside { display: none !important; }")
54. Hide navigation (cssCommand: "nav { display: none !important; }")
55. Highlight paragraphs on hover (cssCommand: "p:hover { background: yellow !important; }")
56. Outline elements on hover (cssCommand: "body *:hover { outline: 2px solid blue !important; }")
57. Make buttons huge (cssCommand: "button { transform: scale(1.5) !important; }")
58. Make buttons tiny (cssCommand: "button { transform: scale(0.5) !important; }")
59. Change button colors (cssCommand: "button { background: hotpink !important; color: white !important; }")
60. Pulsing buttons (cssCommand: "@keyframes btnPulse { 0% {transform: scale(1);} 50% {transform: scale(1.1);} 100% {transform: scale(1);} } button { animation: btnPulse 1s infinite !important; }")
61. Change cursor to crosshair (cssCommand: "body * { cursor: crosshair !important; }")
62. Change cursor to wait (cssCommand: "body * { cursor: wait !important; }")
63. Change cursor to help (cssCommand: "body * { cursor: help !important; }")
64. Hide cursor (cssCommand: "body * { cursor: none !important; }")
65. Colorful scrollbar (cssCommand: "::-webkit-scrollbar { width: 10px; } ::-webkit-scrollbar-thumb { background: pink; }")
66. Hide scrollbar (cssCommand: "::-webkit-scrollbar { display: none; }")
67. Smooth scrolling (cssCommand: "html { scroll-behavior: smooth !important; }")
68. Disable pointer events (cssCommand: "body { pointer-events: none !important; }")
69. Blur background (cssCommand: "body { backdrop-filter: blur(10px); }")
70. Add grid background (cssCommand: "body { background-image: linear-gradient(to right, #ccc 1px, transparent 1px), linear-gradient(to bottom, #ccc 1px, transparent 1px); background-size: 20px 20px; }")
71. Add dotted background (cssCommand: "body { background-image: radial-gradient(#ccc 1px, transparent 1px); background-size: 20px 20px; }")
72. Add striped background (cssCommand: "body { background: repeating-linear-gradient(45deg, #f0f0f0, #f0f0f0 10px, #ffffff 10px, #ffffff 20px); }")
73. Make text selectable (cssCommand: "body * { user-select: auto !important; }")
74. Make text unselectable (cssCommand: "body * { user-select: none !important; }")
75. Glow effect on text (cssCommand: "body * { text-shadow: 0 0 10px #0ff !important; }")
76. Neon borders (cssCommand: "body * { border: 2px solid #0f0 !important; box-shadow: 0 0 10px #0f0 !important; }")
77. Read page aloud (action: {"type": "speech", "text": "text to say..."})
78. Throw confetti (action: {"type": "confetti"})
79. Find specific word (action: {"type": "warp", "targetText": "word"})
80. Navigate to product (action: {"type": "warp_cross_page", "url": "url"})
81. Highlight specific element (action: {"type": "highlight", "selector": "selector"})
82. Summarize page (reply: "summary...")
83. Explain selected text (reply: "explanation...")
84. Answer questions about page (reply: "answer...")
85. Suggest related items (interactive: {"type": "carousel", ...})
86. Show options menu (interactive: {"type": "options", ...})
87. Show confirmation slider (interactive: {"type": "action_slider", ...})
88. Change language to Thai (reply in Thai)
89. Change language to English (reply in English)
90. Change language to Japanese (reply in Japanese)
91. Change language to Chinese (reply in Chinese)
92. Change language to French (reply in French)
93. Change language to German (reply in German)
94. Change language to Spanish (reply in Spanish)
95. Change language to Korean (reply in Korean)
96. Reset styles (cssCommand: " ")
97. Answer math problems
98. Write code
99. Translate text
100. Any other UI or text change request! You are literally capable of fulfilling ANY request using CSS or Actions!`;

// ─── Circuit Breaker ────────────────────────────────────────────

const circuitBreaker = {
    groq: { failures: 0, cooldownUntil: 0 },
    cohere: { failures: 0, cooldownUntil: 0 },
    gemini: { failures: 0, cooldownUntil: 0 },
    cooldownMs: 60000,
    maxFailures: 3,
    isOpen: function (provider) {
        var entry = this[provider];
        if (!entry) return false;
        if (entry.failures >= this.maxFailures && Date.now() < entry.cooldownUntil) return true;
        if (Date.now() >= entry.cooldownUntil && entry.failures >= this.maxFailures) { entry.failures = 0; }
        return false;
    },
    recordFailure: function (provider) {
        var entry = this[provider];
        if (!entry) return;
        entry.failures++;
        entry.cooldownUntil = Date.now() + this.cooldownMs;
    },
    recordSuccess: function (provider) {
        var entry = this[provider];
        if (!entry) return;
        entry.failures = 0;
    }
};

// ─── Semantic Cache ─────────────────────────────────────────────

var semanticCache = {
    _store: new Map(),
    _maxSize: 100,
    _ttlMs: 600000,
    _hash: function (text) {
        var hash = 0;
        if (!text) return "0";
        for (var i = 0; i < text.length; i++) { var chr = text.charCodeAt(i); hash = ((hash << 5) - hash) + chr; hash |= 0; }
        return String(hash);
    },
    _makeKey: function (payload) {
        var parts = [
            (payload.prompt || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200),
            (payload.title || "").toLowerCase().slice(0, 50),
            payload.isProactive ? "proactive" : "reactive",
            payload.locale || "en"
        ];
        if (payload.pageContent) {
            var words = payload.pageContent.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 3; });
            var freq = {};
            for (var i = 0; i < words.length; i++) { freq[words[i]] = (freq[words[i]] || 0) + 1; }
            var topWords = Object.entries(freq).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10).map(function (e) { return e[0]; });
            parts.push(topWords.join(","));
        }
        return this._hash(parts.join("|"));
    },
    get: function (payload) {
        var key = this._makeKey(payload);
        var entry = this._store.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this._ttlMs) { this._store.delete(key); return null; }
        entry.hits = (entry.hits || 0) + 1;
        return entry.data;
    },
    set: function (payload, data) {
        if (this._store.size >= this._maxSize) {
            var oldest = null, oldestKey = null;
            this._store.forEach(function (v, k) { if (!oldest || v.timestamp < oldest.timestamp) { oldest = v; oldestKey = k; } });
            if (oldestKey) this._store.delete(oldestKey);
        }
        this._store.set(this._makeKey(payload), { data: data, timestamp: Date.now(), hits: 1 });
    },
    stats: function () {
        var entries = [];
        this._store.forEach(function (v, k) { entries.push({ key: k, age: Date.now() - v.timestamp, hits: v.hits }); });
        return { size: this._store.size, entries: entries };
    }
};

// ─── PII Masking ────────────────────────────────────────────────

function maskPII(text) {
    if (typeof text !== "string" || !text) return text || "";
    return text
        .replace(/\b[\w.\-]+@[\w.\-]+\.\w{2,}\b/gi, "[REDACTED_EMAIL]")
        .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED_CARD]")
        .replace(/\b\d{13}\b/g, "[REDACTED_ID]")
        .replace(/\b0[0-9]{8,9}\b/g, "[REDACTED_PHONE]")
        .replace(/\b(?:นาย|นาง|นางสาว| Mr\.|Mrs\.|Ms\.|Mr |Mrs |Ms |Dr\.|Dr )\s*\w+/gi, "[REDACTED_NAME]")
        .replace(/\b(?:\+?66|0)\d{8,9}\b/g, "[REDACTED_PHONE]")
        .replace(/\d{5,9}[-/]\d{2,4}[-/]\d{2,4}\b/g, "[REDACTED_DOB]")
        .replace(/\b(?:secret|token|api[-_]?key|private[-_]?key)\s*[:=]\s*['\"]?\w{8,}/gi, "[REDACTED_SECRET]")
        .replace(/\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi, "[REDACTED_PASSWORD]");
}

// ─── RAG Helper ──────────────────────────────────────────────────
async function generateEmbedding(text, apiKey) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=" + apiKey;
    var res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text: text }] }
        })
    });
    if (!res.ok) throw new Error("Gemini embedding failed");
    var data = await res.json();
    return data.embedding.values;
}

// ─── Handler ────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const body = parseBody(req.body);

        // ─── API Key Validation (Package & Expiry Control) ───
        let tenantInfo = null;
        let isValid = true; // Default: allow through (graceful mode)
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

                    if (error) {
                        console.error("Supabase tenant query error:", error);
                        // DB error — still allow through (graceful)
                    } else if (data) {
                        tenantInfo = data;
                        // Check if suspended or expired
                        if (data.status === 'suspended') {
                            isValid = false;
                            tenantError = "บัญชีถูกระงับการใช้งาน (Suspended)";
                        } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
                            isValid = false;
                            tenantError = "Package หมดอายุ (Expired) กรุณาต่ออายุเพื่อใช้งานต่อ";
                        }
                    } else {
                        // API key not found in DB — still allow through
                        console.warn("API key not found in DB, allowing through:", (body.apiKey || '').slice(0, 12));
                    }
                } else {
                    console.warn("Supabase not initialized — skipping tenant validation");
                }
            } catch (err) {
                console.error("Tenant validation error:", err);
                // Error — still allow through (graceful)
            }
        }

        if (!isValid) {
            // Only block if explicitly suspended or expired
            try {
                if (supabase) {
                    await supabase.from('logs').insert({
                        type: 'warn',
                        message: `Blocked chat request: ${tenantError}`,
                        metadata: { apiKeyPrefix: (body.apiKey || '').slice(0, 12) + '...' }
                    });
                }
            } catch (_) { }

            return res.status(403).json({
                status: "blocked",
                reply: tenantError,
                error: tenantError,
                interactive: null,
                action: { type: "disable_widget" }
            });
        }

        // Log successful request (fire-and-forget)
        if (supabase && tenantInfo) {
            supabase.from('logs').insert({
                type: 'info',
                message: `Chat request from ${tenantInfo.company_name || tenantInfo.id}`,
                metadata: { tenantId: tenantInfo.id }
            }).then().catch(() => { });
        }
        // ─────────────────────────────────────────────────────

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

        // ─── RAG Context Retrieval ───
        payload.ragContext = "";
        if (rawPrompt && tenantInfo && supabase && process.env.GEMINI_API_KEY) {
            try {
                const queryEmbedding = await generateEmbedding(rawPrompt, process.env.GEMINI_API_KEY);
                const { data: chunks, error } = await supabase.rpc('match_knowledge_chunks', {
                    query_embedding: queryEmbedding,
                    match_threshold: 0.3,
                    match_count: 5,
                    filter_tenant_id: tenantInfo.id
                });
                if (!error && chunks && chunks.length > 0) {
                    payload.ragContext = chunks.map(c => `[Source: ${c.title || c.url}]\n${c.content}`).join('\n\n');
                    console.log(`[RAG] Retreived ${chunks.length} chunks for tenant ${tenantInfo.id}`);
                }
            } catch (ragErr) {
                console.error("[RAG Error]", ragErr.message);
            }
        }
        // ──────────────────────────────

        var cached = semanticCache.get(payload);
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
            reply: "ขออภัยค่ะ ระบบขัดข้องชั่วคราว รบกวนลองใหม่อีกครั้งนะคะ",
            cssCommand: "",
            action: null,
            interactive: null,
            status: "error"
        });
    }
};

// ═══════════════════════════════════════════════════════════════════
// TRIPLE-BRAIN ORCHESTRATION MATRIX
// ═══════════════════════════════════════════════════════════════════

async function multiAgentPipeline(payload) {
    // ─── PARALLEL: Brain 1 (Groq) + Brain 2 (Cohere) ───────
    var brain1Result = null;
    var brain2Result = null;

    var results = await Promise.allSettled([
        brain1IntentParsing(payload),
        brain2SafetyAudit(payload)
    ]);

    // Process Brain 1 result (Intent & DOM parsing, primary: Groq)
    if (results[0].status === "fulfilled" && results[0].value) {
        brain1Result = results[0].value;
    }
    if (!brain1Result) {
        brain1Result = await brain1Fallback(payload);
    }

    console.log("[DEBUG] Brain 1 Output:", JSON.stringify(brain1Result));

    if (!brain1Result || !brain1Result.intent) {
        console.warn("[Pipeline] Brain 1 Failed. Injecting Default Intent to prevent silent drop.");
        // บังคับยัด Default Schema เพื่อให้ Brain 3 ตอบกลับผู้ใช้ได้
        brain1Result = {
            intent: "general_chat",
            actionType: "null",
            targetText: "",
            keywords: [],
            confidence: 0.5,
            requiresWarp: false,
            industry: "other",
            persona: "helpful assistant",
            tone: "friendly"
        };
    }

    // Process Brain 2 result (Safety audit, primary: Cohere)
    if (results[1].status === "fulfilled" && results[1].value) {
        brain2Result = results[1].value;
    }
    if (!brain2Result) {
        brain2Result = await brain2Fallback(brain1Result, payload);
    }

    // Built-in Zero-Trust check (always runs regardless of provider health)
    var zeroTrustCheck = checkZeroTrust(brain1Result, payload);
    if (zeroTrustCheck.safe === false) {
        return {
            reply: zeroTrustCheck.reason || "",
            cssCommand: "",
            action: null,
            interactive: null,
            status: "blocked",
            safetyReason: zeroTrustCheck.reason,
            confirmationRequired: true
        };
    }

    var safetyResult = brain2Result || { safe: true, confirmationRequired: false, riskLevel: "low" };
    if (zeroTrustCheck.confirmationRequired) {
        safetyResult.confirmationRequired = true;
    }

    if (safetyResult.safe === false && safetyResult.riskLevel !== "medium") {
        return {
            reply: safetyResult.reason || "",
            cssCommand: "",
            action: null,
            interactive: null,
            status: "blocked",
            safetyReason: safetyResult.reason,
            confirmationRequired: safetyResult.confirmationRequired || false
        };
    }

    // ─── Brain 3: Creative Synthesis (primary: Gemini, fallback: Groq) ───
    var result = await brain3ResponseGeneration(brain1Result, safetyResult, payload);

    if (!result) {
        result = await brain3Fallback(brain1Result, safetyResult, payload);
    }

    if (!result) {
        // ไม่เคย silent_abort — ส่ง friendly fallback reply ให้ผู้ใช้เสมอ
        console.warn("[Pipeline] Brain 3 all providers failed. Returning human-friendly fallback.");
        return {
            reply: "สวัสดีครับ ✨ มีอะไรให้ผมช่วยได้ไหมครับ? ถามมาได้เลยนะครับ",
            cssCommand: "",
            action: null,
            interactive: {
                type: "options",
                message: "ผมช่วยคุณได้หลายอย่างครับ",
                items: [
                    { name: "แนะนำสินค้า", description: "ให้ผมช่วยหาสิ่งที่คุณต้องการ" },
                    { name: "ถามคำถาม", description: "ถามอะไรก็ได้เกี่ยวกับเว็บนี้" },
                    { name: "ขอความช่วยเหลือ", description: "บอกปัญหาของคุณมาได้เลย" }
                ]
            },
            status: "ok"
        };
    }

    console.log("[DEBUG] Brain 3 Output:", JSON.stringify(result));

    return result;
}

// ─── Brain 1: Intent & DOM Parsing ───────────────────────────────

async function brain1IntentParsing(payload) {
    var groqKey = process.env.GROQ_API_KEY || process.env.API_KEY;
    if (!groqKey || circuitBreaker.isOpen("groq")) return null;

    var systemPrompt = payload.isProactive ? buildProactiveContextPrompt(payload) : buildContextPrompt(payload);
    var userMsg = buildUserMessage(payload);

    try {
        var result = await callIntentGroq(groqKey, systemPrompt, userMsg);
        if (result) {
            circuitBreaker.recordSuccess("groq");
            return result;
        }
    } catch (err) {
        circuitBreaker.recordFailure("groq");
        console.error("[Brain1/Groq]", err.message);
    }
    return null;
}

async function brain1Fallback(payload) {
    var geminiKeys = collectGeminiKeys();
    var cohereKey = process.env.COHERE_API_KEY;
    var systemPrompt = payload.isProactive ? buildProactiveContextPrompt(payload) : buildContextPrompt(payload);
    var userMsg = buildUserMessage(payload);

    // Fallback to Gemini
    for (var i = 0; i < geminiKeys.length; i++) {
        if (circuitBreaker.isOpen("gemini")) break;
        try {
            var result = await callIntentGemini(geminiKeys[i], systemPrompt, userMsg);
            if (result) {
                circuitBreaker.recordSuccess("gemini");
                return result;
            }
        } catch (err) {
            circuitBreaker.recordFailure("gemini");
            console.error("[Brain1/Gemini/" + i + "]", err.message);
        }
    }

    // Final fallback to Cohere
    if (cohereKey && !circuitBreaker.isOpen("cohere")) {
        try {
            var result = await callIntentCohere(cohereKey, systemPrompt, userMsg);
            if (result) {
                circuitBreaker.recordSuccess("cohere");
                return result;
            }
        } catch (err) {
            circuitBreaker.recordFailure("cohere");
            console.error("[Brain1/Cohere]", err.message);
        }
    }

    return null;
}

// ─── Brain 2: Safety & Policy Audit ──────────────────────────────

async function brain2SafetyAudit(payload) {
    var cohereKey = process.env.COHERE_API_KEY;
    if (!cohereKey || circuitBreaker.isOpen("cohere")) return null;

    try {
        var result = await callSafetyCohere(cohereKey, payload);
        if (result) {
            circuitBreaker.recordSuccess("cohere");
            return result;
        }
    } catch (err) {
        circuitBreaker.recordFailure("cohere");
        console.error("[Brain2/Cohere]", err.message);
    }
    return null;
}

async function brain2Fallback(phase1Result, payload) {
    var geminiKeys = collectGeminiKeys();
    var groqKey = process.env.GROQ_API_KEY || process.env.API_KEY;
    var safetyPrompt = buildUniversalSafetyPrompt(phase1Result, payload);

    // Fallback to Gemini
    for (var i = 0; i < geminiKeys.length; i++) {
        if (circuitBreaker.isOpen("gemini")) break;
        try {
            var result = await callSafetyGemini(geminiKeys[i], safetyPrompt);
            if (result) {
                circuitBreaker.recordSuccess("gemini");
                return result;
            }
        } catch (err) {
            circuitBreaker.recordFailure("gemini");
            console.error("[Brain2/Gemini/" + i + "]", err.message);
        }
    }

    // Final fallback to Groq
    if (groqKey && !circuitBreaker.isOpen("groq")) {
        try {
            var result = await callSafetyGroq(groqKey, safetyPrompt);
            if (result) {
                circuitBreaker.recordSuccess("groq");
                return result;
            }
        } catch (err) {
            circuitBreaker.recordFailure("groq");
            console.error("[Brain2/Groq]", err.message);
        }
    }

    return null;
}

// ─── Brain 3: Creative Response Generation ───────────────────────

async function brain3ResponseGeneration(phase1Result, phase2Result, payload) {
    var geminiKeys = collectGeminiKeys();
    var systemPrompt = payload.isProactive
        ? buildProactiveSystemPrompt(payload)
        : buildAdaptiveResponsePrompt(payload, phase1Result, phase2Result);
    var userMsg = buildResponseUserMessage(payload, phase1Result);

    for (var i = 0; i < geminiKeys.length; i++) {
        if (circuitBreaker.isOpen("gemini")) break;
        try {
            var result = await callResponseGemini(geminiKeys[i], systemPrompt, userMsg);
            if (result) {
                circuitBreaker.recordSuccess("gemini");
                return result;
            }
        } catch (err) {
            circuitBreaker.recordFailure("gemini");
            console.error("[Brain3/Gemini/" + i + "]", err.message);
        }
    }
    return null;
}

async function brain3Fallback(phase1Result, phase2Result, payload) {
    var groqKey = process.env.GROQ_API_KEY || process.env.API_KEY;
    var cohereKey = process.env.COHERE_API_KEY;

    // GROQ absorbs Phase 3 with enriched descriptive prompt
    var groqPrompt = buildGroqFallbackPrompt(payload, phase1Result, phase2Result);
    var userMsg = buildResponseUserMessage(payload, phase1Result);

    if (groqKey && !circuitBreaker.isOpen("groq")) {
        try {
            var result = await callResponseGroq(groqKey, groqPrompt, userMsg);
            if (result) {
                circuitBreaker.recordSuccess("groq");
                return result;
            }
        } catch (err) {
            circuitBreaker.recordFailure("groq");
            console.error("[Brain3/Groq]", err.message);
        }
    }

    // Cohere as last resort
    if (cohereKey && !circuitBreaker.isOpen("cohere")) {
        try {
            var result = await callResponseCohere(cohereKey, groqPrompt, userMsg);
            if (result) {
                circuitBreaker.recordSuccess("cohere");
                return result;
            }
        } catch (err) {
            circuitBreaker.recordFailure("cohere");
            console.error("[Brain3/Cohere]", err.message);
        }
    }

    return null;
}

// ─── Zero-Trust Check ────────────────────────────────────────────

function checkZeroTrust(phase1Result, payload) {
    var result = { safe: true, reason: "", confirmationRequired: false };
    var targetText = (phase1Result && phase1Result.targetText) || "";
    var intent = (phase1Result && phase1Result.intent) || "";
    var actionType = (phase1Result && phase1Result.actionType) || "null";

    // เอา actionType ออกจากการเช็ค Regex เพื่อลด False Positive
    var checkText = (targetText + " " + intent).toLowerCase();

    var sensitivePatterns = [
        { re: /password|credential|ssn|sin|token|secret|api.?key/i, label: "credentials/secrets" },
        { re: /checkout|payment|pay|billing|check.?out/i, label: "payment flow" },
        { re: /login|signin|sign.?in|log.?in/i, label: "authentication" },
        { re: /admin|administrator|dashboard.*admin/i, label: "admin access" },
        { re: /iframe|embed.*frame/i, label: "embedded frame" },
        { re: /download|export.*file|attachment/i, label: "file download" },
        { re: /javascript:|onclick=|onload=|script.*src/i, label: "script injection" },
        { re: /credit.?card|card.?number|cvv|cvc|card.?payment/i, label: "financial data" }
    ];

    for (var i = 0; i < sensitivePatterns.length; i++) {
        if (sensitivePatterns[i].re.test(checkText)) {
            // บล็อกเฉพาะเมื่อมีการสั่ง Action ที่ไม่ใช่แค่การตอบคำถาม
            if (actionType !== "null" && actionType !== "answer" && actionType !== "speech") {
                result.safe = false;
                result.reason = "references sensitive area: " + sensitivePatterns[i].label + " (Active Action: " + actionType + ")";
                result.confirmationRequired = true;
                return result;
            } else {
                // ถ้าเป็นแค่การคุยกัน (Action = null) แค่ติดป้ายเตือน แต่ไม่บล็อก
                result.confirmationRequired = true;
            }
        }
    }
    return result;
}

// ─── PII Helpers ─────────────────────────────────────────────────

function maskDOMSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return snapshot;
    var masked = {};
    for (var key in snapshot) {
        if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
            var val = snapshot[key];
            if (typeof val === "string") masked[key] = maskPII(val);
            else if (Array.isArray(val)) masked[key] = val.map(function (v) { return typeof v === "string" ? maskPII(v) : v; });
            else masked[key] = val;
        }
    }
    return masked;
}

function maskHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.slice(-MAX_HISTORY_ITEMS).map(function (item) {
        return { role: item && item.role === "assistant" ? "assistant" : "user", text: maskPII(cleanText(item && item.text, 1000)) };
    }).filter(function (item) { return item.text; });
}

function sanitizeDNA(dna) {
    if (!dna || typeof dna !== "object") return {};
    var result = {};
    if (typeof dna.title === "string") result.title = maskPII(dna.title.slice(0, 200));
    if (typeof dna.metaDescription === "string") result.metaDescription = maskPII(dna.metaDescription.slice(0, 500));
    if (typeof dna.metaKeywords === "string") result.metaKeywords = maskPII(dna.metaKeywords.slice(0, 500));
    if (Array.isArray(dna.h1)) result.h1 = dna.h1.map(function (h) { return maskPII(String(h).slice(0, 200)); }).slice(0, 5);
    if (typeof dna.lang === "string") result.lang = dna.lang.slice(0, 10);
    if (typeof dna.ogType === "string") result.ogType = dna.ogType.slice(0, 100);
    if (typeof dna.activeSectionTag === "string") result.activeSectionTag = dna.activeSectionTag.slice(0, 50);
    if (typeof dna.activeSectionType === "string") result.activeSectionType = dna.activeSectionType.slice(0, 50);
    if (typeof dna.activeSectionText === "string") result.activeSectionText = maskPII(dna.activeSectionText.slice(0, 1000));
    return result;
}

function collectGeminiKeys() {
    return [
        process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3, process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY_5
    ].filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════
// PROVIDER CALLERS — INTENT (UNIFIED SCHEMA)
// ═══════════════════════════════════════════════════════════════════

async function callIntentGroq(apiKey, systemPrompt, userMsg) {
    var url = "https://api.groq.com/openai/v1/chat/completions";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 10000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
                temperature: 0.1, max_tokens: 600,
                response_format: { type: "json_object" }
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) return null;
        return parseIntentSchema(content);
    } finally { clearTimeout(timeout); }
}

async function callIntentGemini(apiKey, systemPrompt, userMsg) {
    var model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [{ text: userMsg }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 600, responseMimeType: "application/json" }
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var content = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
        if (!content) return null;
        return parseIntentSchema(content);
    } finally { clearTimeout(timeout); }
}

async function callIntentCohere(apiKey, systemPrompt, userMsg) {
    var url = "https://api.cohere.ai/v1/chat";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
            body: JSON.stringify({
                model: "command-r",
                message: userMsg,
                preamble: systemPrompt,
                temperature: 0.1, max_tokens: 600
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var content = data && data.text;
        if (!content) return null;
        return parseIntentSchema(content);
    } finally { clearTimeout(timeout); }
}

// ─── Unified Intent Schema Parser ────────────────────────────────

function parseIntentSchema(raw) {
    if (!raw || typeof raw !== "string") return null;
    var parsed = safeJson(raw);
    if (!parsed) {
        var match = raw.match(/\{[\s\S]*\}/);
        if (match) parsed = safeJson(match[0]);
    }
    if (!parsed || typeof parsed !== "object") return null;

    var industry = typeof parsed.industry === "string" ? parsed.industry.toLowerCase().replace(/[^a-z_]/g, "") : "other";
    if (Object.keys(INDUSTRY_LABELS).indexOf(industry) === -1) industry = "other";

    return {
        intent: typeof parsed.intent === "string" ? parsed.intent : "",
        actionType: typeof parsed.actionType === "string" ? parsed.actionType : null,
        targetText: typeof parsed.targetText === "string" ? parsed.targetText : "",
        keywords: Array.isArray(parsed.keywords)
            ? parsed.keywords.filter(function (k) { return typeof k === "string" && k.length > 1; }).slice(0, 20)
            : [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        requiresWarp: parsed.requiresWarp === true,
        industry: industry,
        persona: typeof parsed.persona === "string" ? parsed.persona : INDUSTRY_LABELS[industry],
        tone: typeof parsed.tone === "string" ? parsed.tone : INDUSTRY_TONES[industry]
    };
}

// ═══════════════════════════════════════════════════════════════════
// PROVIDER CALLERS — SAFETY (UNIFIED SCHEMA)
// ═══════════════════════════════════════════════════════════════════

async function callSafetyCohere(apiKey, payload) {
    var url = "https://api.cohere.ai/v1/chat";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 10000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
            body: JSON.stringify({
                model: "command-r",
                message: "Evaluate safety against universal principles: " + UNIVERSAL_SAFETY_RULES.join("; ") + ". Page content: " + (payload.pageContent || "").slice(0, 2000),
                preamble: "You are a universal safety auditor. Evaluate against: PII extraction, form submission, redirects, script injection, token access, content modification, downloads, payment automation. Return ONLY valid JSON: {\"safe\":true|false,\"reason\":\"...\",\"confirmationRequired\":true|false,\"riskLevel\":\"low\"|\"medium\"|\"high\"}",
                temperature: 0.1, max_tokens: 300
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var content = data && data.text;
        if (!content) return null;
        return parseSafetySchema(content);
    } finally { clearTimeout(timeout); }
}

async function callSafetyGroq(apiKey, safetyPrompt) {
    var url = "https://api.groq.com/openai/v1/chat/completions";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 10000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "system", content: "You are a safety auditor. Return JSON only." }, { role: "user", content: safetyPrompt }],
                temperature: 0.1, max_tokens: 300,
                response_format: { type: "json_object" }
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) return null;
        return parseSafetySchema(content);
    } finally { clearTimeout(timeout); }
}

async function callSafetyGemini(apiKey, safetyPrompt) {
    var model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 10000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: "You are a safety auditor. Return JSON only." }] },
                contents: [{ role: "user", parts: [{ text: safetyPrompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 300, responseMimeType: "application/json" }
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var content = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
        if (!content) return null;
        return parseSafetySchema(content);
    } finally { clearTimeout(timeout); }
}

function parseSafetySchema(raw) {
    if (!raw || typeof raw !== "string") return null;
    var parsed = safeJson(raw);
    if (!parsed) {
        var match = raw.match(/\{[\s\S]*\}/);
        if (match) parsed = safeJson(match[0]);
    }
    if (!parsed || typeof parsed !== "object") return null;

    return {
        safe: parsed.safe !== false,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
        confirmationRequired: parsed.confirmationRequired === true,
        riskLevel: typeof parsed.riskLevel === "string" ? parsed.riskLevel : "low"
    };
}

// ═══════════════════════════════════════════════════════════════════
// PROVIDER CALLERS — RESPONSE (UNIFIED SCHEMA)
// ═══════════════════════════════════════════════════════════════════

async function callResponseGemini(apiKey, systemPrompt, userMsg) {
    var model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 25000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [{ text: userMsg }] }],
                // ปรับ Temperature เป็น 0.7 และใช้ JSON Mode เพื่อความยืดหยุ่นและเสถียร
                generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 1000, responseMimeType: "application/json" }
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var replyText = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
        if (!replyText) return null;
        return parseFinalResponse(replyText);
    } finally { clearTimeout(timeout); }
}

async function callResponseGroq(apiKey, systemPrompt, userMsg) {
    var url = "https://api.groq.com/openai/v1/chat/completions";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
                temperature: 0.2, max_tokens: 900,
                response_format: { type: "json_object" }
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) return null;
        return parseFinalResponse(content);
    } finally { clearTimeout(timeout); }
}

async function callResponseCohere(apiKey, systemPrompt, userMsg) {
    var url = "https://api.cohere.ai/v1/chat";
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
            body: JSON.stringify({
                model: "command-r",
                message: userMsg,
                preamble: systemPrompt + "\nRespond in JSON format only.",
                temperature: 0.2, max_tokens: 900
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        var raw = await res.text();
        var data = safeJson(raw);
        var content = data && data.text;
        if (!content) return null;
        return parseFinalResponse(content);
    } finally { clearTimeout(timeout); }
}

// ═══════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════════

function buildContextPrompt(payload) {
    var dna = payload.siteDNA || {};
    var dnaBlock = [
        dna.title ? "Site title: " + dna.title : "",
        dna.metaDescription ? "Meta: " + dna.metaDescription : "",
        dna.metaKeywords ? "Keywords: " + dna.metaKeywords : "",
        dna.headings && dna.headings.length ? "Headings: " + dna.headings.join(" | ") : "",
        dna.entities && dna.entities.length ? "Products/Entities: " + dna.entities.join(" | ") : "",
        dna.dataPoints && dna.dataPoints.length ? "Data points: " + dna.dataPoints.join(" | ") : "",
        dna.geoContext ? "User Geo Context: " + dna.geoContext : "",
        dna.ogType ? "OG type: " + dna.ogType : "",
        dna.activeSectionTag ? "Active section: <" + dna.activeSectionTag + ">" : "",
        dna.activeSectionText ? "Section text: " + dna.activeSectionText.slice(0, 300) : ""
    ].filter(Boolean).join("\n");
    return [
        "You are a Universal Domain Context Analyzer. Analyze the website structured data, DOM, and user query to determine the site's industry and the user's intent.",
        "Respond in " + (payload.locale || "English") + " ONLY for intent and persona fields. JSON keys stay in English.",
        "Return ONLY valid JSON:",
        "{",
        '  "intent": "brief description of what the user wants (in user\'s language)",',
        '  "industry": "healthcare|e-commerce|saas|education|blog|real_estate|finance|entertainment|government|other",',
        '  "persona": "AI persona that best fits this site (e.g. clinical advisor, shopping assistant, tech support, academic tutor, content guide, property agent, financial advisor, entertainment guide, public service assistant, helpful assistant)",',
        '  "tone": "professional|casual|clinical|academic|technical|friendly|formal|fun",',
        '  "actionType": "warp|highlight|confetti|speech|answer|null",',
        '  "targetText": "exact text from pageContent or entities if user references specific content",',
        '  "keywords": ["relevant", "search", "words"],',
        '  "confidence": 0.0 - 1.0,',
        '  "requiresWarp": true|false',
        "}",
        "RULES: If user asks a general question, set intent to 'general_chat' and actionType to 'answer' or 'null'. If user asks to find/locate/go to something, ALWAYS set actionType='warp' and targetText to their search term, even if it's NOT in pageContent.",
        dnaBlock ? "SITE STRUCTURED DNA:\n" + dnaBlock : "",
        payload.pageContent ? "PAGE CONTENT:\n" + payload.pageContent : "",
        payload.selectedText ? "SELECTED TEXT: " + payload.selectedText : ""
    ].filter(Boolean).join("\n");
}

function buildProactiveContextPrompt(payload) {
    var snapshot = payload.domSnapshot || {};
    var hoverTexts = Array.isArray(snapshot.hoveredElements) ? snapshot.hoveredElements.map(function (h) { return h.text; }).filter(Boolean).join(", ") : "";
    var dna = payload.siteDNA || {};
    var dnaBlock = [
        dna.title ? "Site: " + dna.title : "",
        dna.metaDescription ? "Desc: " + dna.metaDescription : "",
        dna.ogType ? "Type: " + dna.ogType : ""
    ].filter(Boolean).join(" | ");
    return [
        "You are a Proactive Context Analyzer. Based on the DOM and user behavior, determine the website's industry and suggest a helpful proactive action.",
        "Return ONLY valid JSON: {\"intent\":\"...\",\"industry\":\"healthcare|e-commerce|saas|education|blog|real_estate|finance|entertainment|government|other\",\"persona\":\"...\",\"tone\":\"...\",\"actionType\":\"warp|highlight|answer|null\",\"targetText\":\"...\",\"keywords\":[],\"confidence\":0-1}",
        "Time on page: " + (snapshot.timeOnPage || 0) + "s  Scroll: " + (snapshot.scrollDepth || 0) + "%",
        hoverTexts ? "User hovering: " + hoverTexts : "",
        dnaBlock ? "DNA: " + dnaBlock : "",
        payload.title ? "Page: " + payload.title : "",
        payload.pageContent ? "Content:\n" + payload.pageContent : ""
    ].filter(Boolean).join("\n");
}

function buildUniversalSafetyPrompt(phase1Result, payload) {
    return JSON.stringify({
        task: "Evaluate this action proposal against universal safety principles",
        action: phase1Result,
        universalRules: UNIVERSAL_SAFETY_RULES,
        industry: phase1Result.industry || "other",
        persona: phase1Result.persona || "assistant",
        context: payload.pageContent ? payload.pageContent.slice(0, 2000) : ""
    }, null, 2);
}

function buildAdaptiveResponsePrompt(payload, phase1Result, phase2Result) {
    var dna = payload.siteDNA || {};
    var dnaBlock = [
        dna.title ? "Site: " + dna.title : "",
        dna.headings && dna.headings.length ? "Topics: " + dna.headings.join(" | ") : "",
        dna.entities && dna.entities.length ? "Products/Items: " + dna.entities.join(" | ") : "",
        dna.geoContext ? "GeoContext: " + dna.geoContext : ""
    ].filter(Boolean).join("\n");
    return [
        'You are "' + (phase1Result.persona || "Helpful Assistant") + '" — a friendly, smart AI assistant embedded on the ' + (phase1Result.industry || "this") + ' website.',
        'Your tone: ' + (phase1Result.tone || "friendly") + '. Be concise, warm, and genuinely helpful.',
        'CRITICAL: YOU MUST RESPOND IN ' + (payload.locale || "the user's language") + '.',
        'ULTRA FLEXIBILITY RULES:',
        '- You CAN and SHOULD answer ANY general question (math, science, cooking, general advice, weather, jokes, etc.) even if it has nothing to do with the website.',
        '- If you do not know something specific to the site, use your general knowledge to help.',
        '- NEVER say "I cannot answer that" or "I only know about this website". Always provide a helpful response.',
        '- If unsure about site-specific data, acknowledge it briefly and still give a general helpful answer.',
        '- Never show error messages, API failures, or technical details to the user.',
        dna.geoContext ? "Adapt your context and currency/metrics to the user's GeoContext." : "",
        "User intent: " + (phase1Result.intent || "general_chat"),
        "Action: " + (phase1Result.actionType || "answer"),
        "Target: " + (phase1Result.targetText || "none"),
        "CRITICAL: If Action is 'warp', you MUST output action.type='warp' and action.targetText=Target. Do NOT set it to null.",
        phase2Result && phase2Result.safe === false ? "⚠️ Safety note: " + (phase2Result.reason || "") : "",
        phase1Result.industry ? "Industry context: " + phase1Result.industry : "",
        dnaBlock ? "Structured DNA:\n" + dnaBlock : "",
        payload.ragContext ? "KNOWLEDGE BASE CONTEXT:\nUse these verified facts to answer the user's query comprehensively. If the information answers their question, summarize it naturally. If a fact contains a URL that is DIFFERENT from the current Page URL, you MUST output actionType: 'warp_cross_page' with that url.\n" + payload.ragContext : "",
        SUPER_AI_100_SKILLS,
        payload.pageContent ? "Page Content (for context):\n" + payload.pageContent : "",
        "Return ONLY valid JSON: {\"reply\":\"your response (in user's language, NEVER empty)\",\"cssCommand\":\"CSS if needed or empty string\",\"action\":{\"type\":\"warp|warp_cross_page|highlight|confetti|speech|inject_html|null\",\"targetText\":\"...\",\"url\":\"...\",\"keywords\":[]},\"interactive\":{\"type\":\"carousel|action_slider|options|null\",\"message\":\"...\",\"items\":[{\"name\":\"...\",\"description\":\"...\",\"image\":\"...\"}]}}",
        "ABSOLUTELY CRITICAL: The 'reply' field must ALWAYS have meaningful text. Never return an empty reply or an error message visible to the user."
    ].filter(Boolean).join("\n");
}

function buildGroqFallbackPrompt(payload, phase1Result, phase2Result) {
    var persona = phase1Result.persona || "Helpful Assistant";
    var industry = phase1Result.industry || "website";
    return [
        'You are "' + persona + '" — a friendly, knowledgeable AI assistant for ' + industry + ' website.',
        'ULTRA FLEXIBILITY: Answer ANY question the user asks, even if unrelated to the website. Use your general knowledge freely.',
        'NEVER show error messages or say you cannot help. Always provide a useful, warm response.',
        "User intent: " + (phase1Result.intent || "general_chat"),
        "Suggested action: " + (phase1Result.actionType || "answer"),
        "Target: " + (phase1Result.targetText || "none"),
        "CRITICAL: If Suggested action is 'warp', you MUST output action.type='warp' and action.targetText=Target. Do NOT set it to null.",
        "Safety: " + (phase2Result && phase2Result.safe === false ? "⚠️ " + (phase2Result.reason || "needs confirmation") : "passed"),
        payload.ragContext ? "KNOWLEDGE BASE CONTEXT (use if relevant):\n" + payload.ragContext : "",
        SUPER_AI_100_SKILLS,
        payload.title ? "Current page: " + payload.title : "",
        payload.pageContent ? "Page content:\n" + payload.pageContent : "",
        "",
        "Return ONLY valid JSON. No text outside the JSON object:",
        "{",
        '  "reply": "response text (user\'s language, always non-empty and helpful)",',
        '  "cssCommand": "CSS rule string or empty",',
        '  "action": {',
        '    "type": "warp|warp_cross_page|highlight|confetti|speech|inject_html|null",',
        '    "targetText": "page content reference (for warp)",',
        '    "url": "target URL (for warp_cross_page)",',
        '    "keywords": ["search", "words"],',
        '    "selector": "CSS selector (for highlight)",',
        '    "text": "speech text (for speech)",',
        '    "html": "HTML string (for inject_html)",',
        '    "containerSelector": "CSS selector (for inject_html)"',
        '  },',
        '  "interactive": {',
        '    "type": "carousel|action_slider|options|null",',
        '    "message": "heading text",',
        '    "items": [{ "name": "...", "description": "...", "image": "..." }]',
        '  }',
        "}",
        "ABSOLUTE RULE: 'reply' must NEVER be empty. If uncertain, give a friendly general answer."
    ].filter(Boolean).join("\n");
}

function buildProactiveSystemPrompt(payload) {
    var snapshot = payload.domSnapshot || {};
    var hoverTexts = Array.isArray(snapshot.hoveredElements) ? snapshot.hoveredElements.map(function (h) { return h.text; }).filter(Boolean).join(", ") : "";
    var dna = payload.siteDNA || {};
    var dnaBlock = [
        dna.title ? "Site: " + dna.title : "",
        dna.ogType ? "Type: " + dna.ogType : ""
    ].filter(Boolean).join(" | ");
    return [
        'You are a Proactive AI for ' + (dna.ogType || "this website") + '.',
        "Time on page: " + (snapshot.timeOnPage || 0) + "s Scroll: " + (snapshot.scrollDepth || 0) + "%",
        hoverTexts ? "User hover: " + hoverTexts : "",
        dnaBlock || "",
        payload.pageContent ? "Content:\n" + payload.pageContent : "",
        "Return JSON: {\"reply\":\"short proactive message\",\"interactive\":{\"type\":\"carousel|options|null\",\"message\":\"...\",\"items\":[]},\"action\":null}"
    ].filter(Boolean).join("\n");
}

function buildResponseUserMessage(payload, phase1Result) {
    if (payload.isProactive) {
        var snapshot = payload.domSnapshot || {};
        return ["User browsing page", "Time: " + (snapshot.timeOnPage || 0) + "s", "Scroll: " + (snapshot.scrollDepth || 0) + "%"].join("\n");
    }
    var history = payload.history.length ? payload.history.map(function (item) { return (item.role === "assistant" ? "AI: " : "User: ") + item.text; }).join("\n") : "No history";
    return "History:\n" + history + "\n\nQuestion: " + payload.prompt;
}

function buildUserMessage(payload) {
    var parts = [];
    if (payload.prompt) parts.push("User message: " + payload.prompt);
    if (payload.selectedText) parts.push("Selected text: " + payload.selectedText);
    if (payload.title) parts.push("Page title: " + payload.title);
    return parts.join("\n") || "No user message";
}

// ═══════════════════════════════════════════════════════════════════
// RESPONSE PARSER & SCHEMA ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════

function parseFinalResponse(text) {
    if (!text) return null;

    var parsed = safeJson(text);
    if (!parsed) {
        var match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = safeJson(match[0]);
    }
    if (!parsed || typeof parsed !== "object") return null;

    var result = {
        reply: typeof parsed.reply === "string" ? parsed.reply : "",
        cssCommand: typeof parsed.cssCommand === "string" ? sanitizeCss(parsed.cssCommand) : "",
        action: null,
        interactive: null
    };

    if (parsed.action && typeof parsed.action === "object" && parsed.action.type) {
        result.action = enforceActionSchema(parsed.action);
    }
    if (parsed.interactive && typeof parsed.interactive === "object" && parsed.interactive.type) {
        result.interactive = enforceInteractiveSchema(parsed.interactive);
    }

    return result;
}

function enforceActionSchema(action) {
    var validTypes = ["warp", "warp_cross_page", "confetti", "highlight", "speech", "inject_html"];
    if (validTypes.indexOf(action.type) === -1) return null;

    var result = { type: action.type };

    switch (action.type) {
        case "warp":
            result.targetText = typeof action.targetText === "string" ? action.targetText.slice(0, 500) : "";
            result.keywords = Array.isArray(action.keywords) ? action.keywords.filter(function (k) { return typeof k === "string" && k.length > 1; }).slice(0, 20) : [];
            if (!result.targetText && result.keywords.length === 0) return null;
            break;
        case "warp_cross_page":
            result.url = typeof action.url === "string" ? action.url.slice(0, 500) : "";
            result.keywords = Array.isArray(action.keywords) ? action.keywords.filter(function (k) { return typeof k === "string" && k.length > 1; }).slice(0, 20) : [];
            if (!result.url) return null;
            break;
        case "confetti": break;
        case "highlight":
            result.selector = typeof action.selector === "string" ? action.selector.slice(0, 200) : "";
            if (!result.selector) return null;
            break;
        case "speech":
            result.text = typeof action.text === "string" ? action.text.slice(0, 1000) : "";
            if (!result.text) return null;
            break;
        case "inject_html":
            result.html = typeof action.html === "string" ? action.html.slice(0, 5000) : "";
            result.containerSelector = typeof action.containerSelector === "string" ? action.containerSelector.slice(0, 200) : "";
            if (!result.html || !result.containerSelector) return null;
            result.confirmationRequired = true;
            result.safetyReason = "html injection requires confirmation";
            break;
    }

    if (action.confirmationRequired === true) {
        result.confirmationRequired = true;
        result.safetyReason = typeof action.safetyReason === "string" ? action.safetyReason : "";
    }

    return result;
}

function enforceInteractiveSchema(interactive) {
    var validTypes = ["carousel", "action_slider", "options"];
    if (validTypes.indexOf(interactive.type) === -1) return null;
    var result = { type: interactive.type, message: typeof interactive.message === "string" ? interactive.message : "", items: [] };
    if (Array.isArray(interactive.items)) {
        result.items = interactive.items.slice(0, 8).map(function (item) {
            if (typeof item !== "object" || !item) return null;
            return {
                name: typeof item.name === "string" ? item.name.slice(0, 100) : "",
                description: typeof item.description === "string" ? item.description.slice(0, 200) : (typeof item.price === "string" ? item.price.slice(0, 50) : ""),
                image: typeof item.image === "string" ? item.image.slice(0, 500) : ""
            };
        }).filter(Boolean);
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBody(body) {
    if (!body) return {};
    if (typeof body === "string") { try { return JSON.parse(body); } catch { return {}; } }
    return body;
}

function cleanText(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

var LOCALE_LABELS = { th: "ภาษาไทย", en: "English", zh: "中文", ja: "日本語" };

function normalizeLocale(value) {
    var code = cleanText(typeof value === "string" ? value : "", 10).toLowerCase().split("-")[0];
    return Object.prototype.hasOwnProperty.call(LOCALE_LABELS, code) ? code : "en";
}

function buildLanguageInstruction(locale) {
    var label = LOCALE_LABELS[normalizeLocale(locale)] || "English";
    return ["ผู้ใช้กำลังสนทนาในภาษา: " + label, "ต้องตอบเป็นภาษา " + label + " เท่านั้น"].join("\n");
}

function safeJson(text) {
    if (!text || typeof text !== "string") return null;
    try {
        // ลบ Markdown Code Blocks ออกก่อน (เช่น ```json และ ```)
        var cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
        return JSON.parse(cleanText);
    } catch (e) {
        // ถ้าวิธีแรกพัง ให้ใช้ Regex ดึงเฉพาะส่วนที่เป็น {} หรือ [] มาลอง Parse อีกรอบ
        var match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match) {
            try { return JSON.parse(match[0]); } catch (err) { return null; }
        }
        return null;
    }
}

function sanitizeCss(css) {
    if (typeof css !== "string" || !css.trim()) return "";
    var t = css.trim().slice(0, 5000);
    if (/(<|>|@import|url\s*\(|javascript:|expression\s*\()/i.test(t)) return "";
    return t;
}

// ═══════════════════════════════════════════════════════════════════
// CACHE STATS ENDPOINT
// ═══════════════════════════════════════════════════════════════════

module.exports.cacheStats = function (req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(semanticCache.stats());
};

// ═══════════════════════════════════════════════════════════════════
// CRAWL HANDLER
// ═══════════════════════════════════════════════════════════════════

module.exports.crawlHandler = async function crawlHandler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        var body = parseBody(req.body);
        var keywords = (body.keywords || []).filter(function (k) { return typeof k === "string" && k.length > 1; }).slice(0, 20);
        var rootUrl = typeof body.rootUrl === "string" && body.rootUrl.indexOf("http") === 0 ? body.rootUrl : null;
        var seedUrls = (body.urls || []).filter(function (u) { return typeof u === "string" && u.indexOf("http") === 0; }).slice(0, 30);
        if (!keywords.length || (!rootUrl && !seedUrls.length)) return res.status(200).json({ results: [] });

        var MAX_PAGES = 50, MAX_DEPTH = 2, TIMEOUT = 5000;
        var seen = new Set(), pages = [], results = [];

        function isHtmlUrl(url) {
            try { var ext = new URL(url).pathname.split(".").pop().toLowerCase(); return ["jpg", "jpeg", "png", "gif", "webp", "svg", "ico", "css", "js", "json", "xml", "pdf", "zip", "mp4", "mp3", "woff", "woff2", "ttf", "eot"].indexOf(ext) === -1; } catch { return false; }
        }

        function extractInternalLinks(html, baseUrl) {
            var links = [], regex = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi, match;
            while ((match = regex.exec(html)) !== null) {
                try {
                    var resolved = new URL(match[1], baseUrl).href;
                    var parsed = new URL(resolved);
                    var base = new URL(baseUrl);
                    if (parsed.origin === base.origin && isHtmlUrl(resolved) && !seen.has(resolved)) {
                        if (!/(admin|login|password|secure|backend|dashboard|checkout|auth)/i.test(parsed.pathname)) {
                            links.push(resolved);
                        }
                    }
                } catch { }
            }
            return links;
        }

        function extractText(html) { return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim(); }

        function scorePage(text, html, url) {
            var lower = text.toLowerCase();
            var matchCount = 0, firstIdx = Infinity;
            for (var i = 0; i < keywords.length; i++) { var idx = lower.indexOf(keywords[i]); if (idx !== -1) { matchCount++; if (idx < firstIdx) firstIdx = idx; } }
            if (matchCount === 0) return null;
            var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            var title = titleMatch ? titleMatch[1].trim() : url;
            var start = Math.max(0, firstIdx - 80);
            return { url: url, title: title, score: matchCount, snippet: text.slice(start, firstIdx + 260).trim() };
        }

        async function fetchPage(url) {
            if (seen.has(url)) return null;
            seen.add(url);
            try {
                var ctrl = new AbortController(), tmr = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
                var res = await fetch(url, { signal: ctrl.signal });
                clearTimeout(tmr);
                if (!res.ok) return null;
                var html = await res.text();
                var text = extractText(html);
                var scored = scorePage(text, html, url);
                if (scored) results.push(scored);
                return html;
            } catch { return null; }
        }

        var queue = [];
        if (rootUrl && !seen.has(rootUrl)) queue.push({ url: rootUrl, depth: 0 });
        for (var ui = 0; ui < seedUrls.length; ui++) { if (!seen.has(seedUrls[ui])) queue.push({ url: seedUrls[ui], depth: 0 }); }

        while (queue.length > 0 && pages.length < MAX_PAGES) {
            var item = queue.shift();
            if (seen.has(item.url)) continue;
            var html = await fetchPage(item.url);
            if (html === null) continue;
            pages.push(item.url);
            if (item.depth < MAX_DEPTH) {
                var links = extractInternalLinks(html, item.url);
                for (var li = 0; li < links.length; li++) {
                    if (!seen.has(links[li]) && queue.length + pages.length < MAX_PAGES) queue.push({ url: links[li], depth: item.depth + 1 });
                }
            }
        }

        results.sort(function (a, b) { return b.score - a.score; });
        return res.status(200).json({ results: results.slice(0, 8) });
    } catch (error) {
        console.error("Crawl error:", error);
        return res.status(200).json({ results: [] });
    }
};