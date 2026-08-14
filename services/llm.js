// OMEGA-JARVIS v3.0.0 — Multi-Agent Orchestrator (Fixed)

const { UNIVERSAL_SAFETY_RULES, checkZeroTrust } = require('./safety');
const { isEnabled } = require('./featureFlags');
const { executePlugin } = require('./plugins/manager');
const { agentStats } = require('../api/v1/health');

const DEFAULT_MODEL = 'gemini-2.5-flash';

// ─── Circuit Breaker ─────────────────────────────────────────────────────────
const circuitBreaker = {
    _state: {},
    maxFailures: 3,
    baseBackoffMs: 1000,
    maxBackoffMs: 60000,
    _ensure(p) { if (!this._state[p]) this._state[p] = { failures: 0, cooldownUntil: 0 }; },
    isOpen(p) {
        this._ensure(p);
        const e = this._state[p];
        if (e.failures >= this.maxFailures && Date.now() < e.cooldownUntil) return true;
        if (Date.now() >= e.cooldownUntil && e.failures >= this.maxFailures) e.failures = 0;
        return false;
    },
    recordFailure(p) {
        this._ensure(p);
        const e = this._state[p];
        e.failures++;
        const backoff = Math.min(this.maxBackoffMs, this.baseBackoffMs * Math.pow(2, e.failures - 1));
        e.cooldownUntil = Date.now() + backoff;
        console.warn(`[CircuitBreaker] ${p} failed ${e.failures}x, cooldown ${backoff}ms`);
    },
    recordSuccess(p) { this._ensure(p); this._state[p].failures = 0; this._state[p].cooldownUntil = 0; }
};

function collectGeminiKeys() {
    return [
        process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3, process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY_5
    ].filter(Boolean);
}

function safeJson(text) {
    if (!text || typeof text !== 'string') return null;
    try {
        let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) { try { return JSON.parse(match[0]); } catch { return null; } }
        return null;
    }
}

// ─── Gemini API Caller ───────────────────────────────────────────────────────
async function callGemini(apiKey, model, systemPrompt, userMsg) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMsg }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        })
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

// ─── Groq API Fallback ────────────────────────────────────────────────────────
async function callGroqFallback(systemPrompt, userMsg) {
    const groqKey = process.env.GROQ_API_KEY || process.env.API_KEY;
    if (!groqKey) throw new Error('No Groq API key configured');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMsg }
            ],
            temperature: 0.7,
            max_tokens: 1024
        })
    });
    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Groq HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content;
}

// ─── Core: Direct Gemini Call (returns widget-compatible format) ─────────────
async function callDirectGemini(payload) {
    const keys = collectGeminiKeys();
    if (keys.length === 0) throw new Error('No Gemini API key configured');

    const locale = payload.locale || 'th';
    const lang = locale === 'th' ? 'ภาษาไทย' : 'English';

    const systemPrompt = [
        `You are INDICATOR WEB CHAT — an intelligent AI assistant embedded on a website.`,
        `ALWAYS respond in ${lang} (locale: ${locale}). Be helpful, concise, and friendly.`,
        payload.siteDNA?.title ? `Current page: "${payload.siteDNA.title}"` : '',
        payload.pageContent ? `Page content: ${payload.pageContent.slice(0, 1500)}` : '',
        payload.ragContext ? `Knowledge base context: ${payload.ragContext}` : '',
        UNIVERSAL_SAFETY_RULES ? String(UNIVERSAL_SAFETY_RULES).slice(0, 400) : '',
        ``,
        `You MUST return ONLY a valid JSON object (no markdown, no extra text):`,
        `{ "reply": "your answer here", "cssCommand": "", "action": null, "interactive": null }`,
        ``,
        `CRITICAL RULES:`,
        `1. DO NOT write javascript or code in "cssCommand". Leave it empty ("").`,
        `2. SPECIAL ACTIONS (set in "action" field, otherwise null):`,
        `   - If user wants to find a product, person, or specific content on the page, use: { "type": "warp", "targetText": "keyword" }`,
        `   - If user wants to talk to a human agent, use: { "type": "handoff" }`
    ].filter(Boolean).join('\n');

    const historyText = Array.isArray(payload.history)
        ? payload.history.slice(-4).map(h => `${h.role}: ${h.text}`).join('\n')
        : '';

    const userMsg = [
        historyText ? `Conversation history:\n${historyText}` : '',
        payload.selectedText ? `User selected text: "${payload.selectedText}"` : '',
        `User message: ${payload.prompt || '(proactive context check)'}`
    ].filter(Boolean).join('\n\n');

    let lastErrorMsg = 'Unknown error';
    for (let i = 0; i < keys.length; i++) {
        const pid = `gemini_${i}`;
        if (circuitBreaker.isOpen(pid)) {
            lastErrorMsg = 'Circuit breaker open for ' + pid;
            continue;
        }
        try {
            const raw = await callGemini(keys[i], DEFAULT_MODEL, systemPrompt, userMsg);
            circuitBreaker.recordSuccess(pid);
            const parsed = safeJson(raw);
            if (parsed && parsed.reply) return parsed;
            // Fallback for broken/truncated JSON: try to extract just the "reply" value
            const replyMatch = raw.match(/"reply"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
            if (replyMatch && replyMatch[1]) {
                const extractedReply = replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                return { reply: extractedReply, cssCommand: '', action: null, interactive: null };
            }
            // Fallback: wrap plain text if it doesn't look like JSON
            return { reply: (raw || '').trim(), cssCommand: '', action: null, interactive: null };
        } catch (err) {
            lastErrorMsg = err.message;
            console.error(`[Gemini key ${i}] Error:`, err.message);
            circuitBreaker.recordFailure(pid);
        }
    }
    
    // --- GROQ FALLBACK ---
    try {
        console.warn('[Gemini Failed] Falling back to GROQ... Last Error:', lastErrorMsg);
        const rawGroq = await callGroqFallback(systemPrompt, userMsg);
        const parsedGroq = safeJson(rawGroq);
        if (parsedGroq && parsedGroq.reply) return parsedGroq;
        return { reply: (rawGroq || '').trim(), cssCommand: '', action: null, interactive: null };
    } catch (fallbackErr) {
        throw new Error('All Gemini keys failed (' + lastErrorMsg + ') AND Groq fallback failed: ' + fallbackErr.message);
    }
}

// ─── Optional: Planner Agent ────────────────────────────────────────────────
async function agentPlanner(payload) {
    if (agentStats) agentStats.planner++;
    const keys = collectGeminiKeys();
    if (!keys.length) return { intent: 'chat', requiresPlugin: null, actionType: 'reply' };

    const systemPrompt = `You are a request classifier. Return ONLY JSON: { "intent": "string", "requiresPlugin": null, "actionType": "reply" }`;
    const userMsg = `Classify: ${payload.prompt}`;

    try {
        const raw = await callGemini(keys[0], DEFAULT_MODEL, systemPrompt, userMsg);
        return safeJson(raw) || { intent: 'chat', requiresPlugin: null, actionType: 'reply' };
    } catch {
        return { intent: 'fallback', requiresPlugin: null, actionType: 'reply' };
    }
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────
async function multiAgentPipeline(payload) {
    try {
        // Proactive check — if no prompt, use context from page (hover/scroll area)
        if (payload.isProactive && !payload.prompt) {
            // Build context from available signals
            const hoverText = payload.domSnapshot && payload.domSnapshot.activeSectionText
                ? payload.domSnapshot.activeSectionText.slice(0, 400)
                : '';
            const pageTitle = (payload.siteDNA && payload.siteDNA.title) || payload.title || '';
            
            // If no meaningful context, abort silently
            if (!hoverText && !pageTitle) {
                return { status: 'silent_abort' };
            }
            
            // Generate a smart proactive whisper from the context
            payload.prompt = `[PROACTIVE_WHISPER] User is browsing: "${pageTitle}". ${hoverText ? `Currently focused on: "${hoverText}".` : ''} Generate a short, helpful 1-sentence proactive suggestion or question in Thai (or the page language) that would help the user. Be conversational and relevant to what they're viewing.`;
        }

        // Optional plugin routing
        if (isEnabled('ENABLE_PLUGINS', payload.tenantId) && isEnabled('ENABLE_MULTI_AGENT', payload.tenantId)) {
            try {
                const plan = await agentPlanner(payload);
                if (plan.requiresPlugin) {
                    const pluginRes = await executePlugin(plan.requiresPlugin, 'onMessage', payload);
                    if (pluginRes) return { ...pluginRes, status: 'ok' };
                }
            } catch (e) {
                console.warn('[Planner] Skipped:', e.message);
            }
        }

        // Core AI call
        if (agentStats) agentStats.executor++;
        const result = await callDirectGemini(payload);

        // Safety check
        const zeroTrust = checkZeroTrust(result, payload);
        if (!zeroTrust.safe) {
            return { reply: `ขออภัย ไม่สามารถตอบคำถามนี้ได้ (${zeroTrust.reason})`, cssCommand: '', action: null, status: 'blocked' };
        }

        return { ...result, status: 'ok' };

    } catch (error) {
        console.error('[Orchestrator Fatal]', error.message);
        return {
            reply: '⚡ ระบบ AI ขัดข้องชั่วคราว รบกวนลองอีกครั้งสักครู่นะครับ',
            cssCommand: '',
            action: null,
            status: 'error'
        };
    }
}

module.exports = { multiAgentPipeline };
