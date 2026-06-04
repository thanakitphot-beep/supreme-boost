// Vercel Serverless Function for Supreme AI Chat.
// Keep GEMINI_API_KEY on the server only. Never put it in the embed script.

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PROMPT_CHARS = 1200;
const MAX_PAGE_CHARS = 6000;
const MAX_SHOP_PROMPT_CHARS = 2500;
const MAX_SELECTED_CHARS = 1200;
const MAX_HISTORY_ITEMS = 8;

module.exports = async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const body = parseBody(req.body);
        const prompt = cleanText(body.prompt, MAX_PROMPT_CHARS);

        if (!prompt) {
            return res.status(400).json({ error: "กรุณาพิมพ์ข้อความก่อนส่ง" });
        }

        const geminiKey = process.env.GEMINI_API_KEY;
        const groqKey = process.env.GROQ_API_KEY;
        const cohereKey = process.env.COHERE_API_KEY;

        if (!geminiKey && !groqKey && !cohereKey) {
            console.error("No API Keys configured.");
            return res.status(500).json({ error: "ระบบยังไม่ได้ตั้งค่า API Key กรุณาแจ้งผู้ดูแลระบบ" });
        }

        const payload = {
            prompt,
            shopPrompt: cleanText(body.shopPrompt, MAX_SHOP_PROMPT_CHARS),
            pageContent: cleanText(body.pageContent, MAX_PAGE_CHARS),
            selectedText: cleanText(body.selectedText, MAX_SELECTED_CHARS),
            history: normalizeHistory(body.history),
            url: cleanText(body.url, 500),
            title: cleanText(body.title, 200),
            locale: normalizeLocale(body.locale)
        };

        let aiData = null;
        let lastError = null;

        // Fallback Logic: 1. Gemini -> 2. Groq -> 3. Cohere
        if (geminiKey) {
            try {
                aiData = await askGemini(geminiKey, payload);
            } catch (error) {
                console.error("Gemini failed, falling back...", error);
                lastError = error;
            }
        }

        if (!aiData && groqKey) {
            try {
                aiData = await askGroq(groqKey, payload);
            } catch (error) {
                console.error("Groq failed, falling back...", error);
                lastError = error;
            }
        }

        if (!aiData && cohereKey) {
            try {
                aiData = await askCohere(cohereKey, payload);
            } catch (error) {
                console.error("Cohere failed...", error);
                lastError = error;
            }
        }

        if (aiData) {
            return res.status(200).json(aiData);
        } else {
            const fallbackReply = buildFallbackReply(payload);
            console.error("All AIs failed, using page-content fallback.");
            return res.status(200).json({ reply: fallbackReply, cssCommand: "", action: null });
        }
    } catch (error) {
        console.error("Supreme AI server error:", error);
        // Always return 200 with a friendly message so the widget never shows a raw error
        return res.status(200).json({
            reply: "ขออภัยครับ ขณะนี้ระบบ AI ไม่สามารถเชื่อมต่อได้ชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ครับ",
            cssCommand: "",
            action: null
        });
    }
};

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBody(body) {
    if (!body) return {};
    if (typeof body === "string") {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }
    return body;
}

function cleanText(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];

    return history
        .slice(-MAX_HISTORY_ITEMS)
        .map((item) => ({
            role: item && item.role === "assistant" ? "assistant" : "user",
            text: cleanText(item && item.text, 1000)
        }))
        .filter((item) => item.text);
}

const LOCALE_LABELS = {
    th: "ภาษาไทย",
    en: "English",
    zh: "中文",
    ja: "日本語"
};

function normalizeLocale(value) {
    const code = cleanText(typeof value === "string" ? value : "", 10).toLowerCase().split("-")[0];
    return Object.prototype.hasOwnProperty.call(LOCALE_LABELS, code) ? code : "en";
}

function buildLanguageInstruction(locale) {
    const label = LOCALE_LABELS[normalizeLocale(locale)];
    return [
        `ผู้ใช้กำลังสนทนาในภาษา: ${label}`,
        `ต้องตอบเป็นภาษา ${label} เท่านั้น แม้ข้อมูลบนหน้าเว็บจะเป็นภาษาอื่นก็ให้แปลและอธิบายด้วยภาษา ${label}`,
        "ถ้าผู้ใช้สลับภาษากลางบทสนทนา ให้ตอบตามภาษาของข้อความล่าสุดเสมอ"
    ].join("\n");
}

async function askGemini(apiKey, payload) {
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: buildSystemPrompt(payload) }]
                },
                contents: [
                    {
                        role: "user",
                        parts: [{ text: buildUserMessage(payload) }]
                    }
                ],
                generationConfig: {
                    temperature: 0.45,
                    topP: 0.9,
                    maxOutputTokens: 900,
                    responseMimeType: "application/json"
                }
            }),
            signal: controller.signal
        });

        const rawText = await response.text();

        if (!response.ok) {
            console.error("Gemini API error:", response.status, rawText);
            throw toPublicGeminiError(response.status);
        }

        const geminiData = safeJson(rawText);
        const replyText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = parseAiReply(replyText);

        return {
            reply: cleanReply(parsed.reply),
            cssCommand: sanitizeCss(parsed.cssCommand),
            action: parsed.action || null
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function askGroq(apiKey, payload) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama3-8b-8192",
                messages: [
                    { role: "system", content: buildSystemPrompt(payload) },
                    { role: "user", content: buildUserMessage(payload) }
                ],
                temperature: 0.45,
                max_tokens: 900,
                response_format: { type: "json_object" }
            }),
            signal: controller.signal
        });

        const rawText = await response.text();
        if (!response.ok) throw new Error(`Groq API Error: ${response.status}`);
        
        const data = safeJson(rawText);
        const replyText = data?.choices?.[0]?.message?.content || "";
        const parsed = parseAiReply(replyText);

        return {
            reply: cleanReply(parsed.reply),
            cssCommand: sanitizeCss(parsed.cssCommand),
            action: parsed.action || null
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function askCohere(apiKey, payload) {
    const url = "https://api.cohere.ai/v1/chat";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "command-r",
                message: buildUserMessage(payload),
                preamble: buildSystemPrompt(payload),
                temperature: 0.45,
                max_tokens: 900
            }),
            signal: controller.signal
        });

        const rawText = await response.text();
        if (!response.ok) throw new Error(`Cohere API Error: ${response.status}`);
        
        const data = safeJson(rawText);
        const replyText = data?.text || "";
        const parsed = parseAiReply(replyText);

        return {
            reply: cleanReply(parsed.reply),
            cssCommand: sanitizeCss(parsed.cssCommand),
            action: parsed.action || null
        };
    } finally {
        clearTimeout(timeout);
    }
}

function buildSystemPrompt(payload) {
    return [
        'คุณคือ "Supreme AI" สุดยอดผู้ช่วยอัจฉริยะ นักออกแบบ UX/UI ระดับโลก และผู้เชี่ยวชาญด้านพฤติกรรมมนุษย์',
        "คุณมีพลังวิเศษในการปรับเปลี่ยนหน้าเว็บ (UI/UX) และโต้ตอบกับผู้ใช้เพื่อสร้างประสบการณ์ที่น่าทึ่งที่สุด",
        "หน้าที่หลักคือตอบคำถามเกี่ยวกับร้านค้า สินค้า และสามารถ 'เสก' ความสวยงามหรือเอฟเฟกต์บนหน้าเว็บได้ทันทีตามอารมณ์ของผู้ใช้",
        "ถ้าผู้ใช้บอกว่าเว็บจืดไป อยากได้เว็บแบบ Cyberpunk, Minimal, หรูหรา หรืออื่นๆ ให้คุณเขียน CSS แบบอลังการเพื่อเปลี่ยนหน้าเว็บทั้งหมด (เปลี่ยนสีพื้นหลัง, ใส่เงา, ฟอนต์, อนิเมชั่น)",
        buildLanguageInstruction(payload.locale),
        "ตอบแบบสุภาพ เป็นมิตร กระชับ และเต็มไปด้วยความกระตือรือร้น",
        "ห้ามแต่งข้อมูลสินค้า ราคา หรือสต็อก ถ้าไม่ทราบให้บอกตรงๆ อย่างสุภาพ",
        "การปรับแต่งหน้าเว็บ ให้ใช้ CSS ล้วน ห้ามใช้ @import, url(), javascript:, expression() หรือ HTML",
        'ห้ามปรับ CSS ของ widget แชทโดยตรง เลี่ยง selector "#supreme-boost-root" และลูกทั้งหมด',
        'ตัวอย่างการขยายอักษร: body > :not(#supreme-boost-root) { font-size: 118% !important; line-height: 1.75 !important; }',
        "คุณสามารถส่งคำสั่ง 'action' เพื่อทำสิ่งเหล่านี้ได้:",
        "- 'confetti': ยิงพลุกระดาษเมื่อผู้ใช้ดีใจ, ซื้อสำเร็จ, หรือต้องการฉลอง",
        "- 'highlight': ไฮไลต์ส่วนของหน้าเว็บ โดยส่ง CSS Selector ไปใน 'selector' (เช่น { type: 'highlight', selector: 'h1' })",
        "- 'speech': อ่านข้อความเสียง โดยส่งข้อความใน 'text' (เช่น { type: 'speech', text: 'สวัสดีครับ' })",
        "ต้องตอบกลับเป็น JSON Format ตามโครงสร้างนี้เท่านั้น ห้ามมีข้อความอื่นปน:",
        '{',
        '  "reply": "ข้อความตอบกลับผู้ใช้",',
        '  "cssCommand": "CSS ล้วนๆ สำหรับแต่งเว็บ หรือว่างเปล่า",',
        '  "action": { "type": "confetti" | "highlight" | "speech", "selector": "...", "text": "..." } // (ส่ง null ถ้าไม่มี action)',
        '}',
        payload.shopPrompt ? `คำสั่งพิเศษจากเจ้าของร้าน: ${payload.shopPrompt}` : "",
        payload.title ? `ชื่อหน้าเว็บ: ${payload.title}` : "",
        payload.url ? `URL หน้าเว็บ: ${payload.url}` : "",
        payload.pageContent ? `ข้อมูลบนหน้าเว็บปัจจุบัน: ${payload.pageContent}` : "",
        payload.selectedText ? `ข้อความที่ผู้ใช้เลือกบนหน้าเว็บ: ${payload.selectedText}` : ""
    ].filter(Boolean).join("\n\n");
}

function buildUserMessage(payload) {
    const history = payload.history.length
        ? payload.history.map((item) => `${item.role === "assistant" ? "AI" : "User"}: ${item.text}`).join("\n")
        : "ไม่มีประวัติสนทนาก่อนหน้า";

    return [
        `ประวัติสนทนาล่าสุด:\n${history}`,
        `คำถามล่าสุดของผู้ใช้:\n${payload.prompt}`
    ].join("\n\n");
}

function safeJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function parseAiReply(text) {
    if (!text) {
        return { reply: "ขออภัยครับ AI ยังไม่สามารถสร้างคำตอบได้ในตอนนี้", cssCommand: "", action: null };
    }

    const direct = safeJson(text);
    if (direct && typeof direct === "object") {
        return direct;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        const extracted = safeJson(jsonMatch[0]);
        if (extracted && typeof extracted === "object") {
            return extracted;
        }
    }

    return { reply: text, cssCommand: "", action: null };
}

function cleanReply(reply) {
    const text = cleanText(reply, 3000);
    return text || "ขออภัยครับ ยังไม่มีคำตอบที่เหมาะสมในตอนนี้";
}

function sanitizeCss(css) {
    const text = typeof css === "string" ? css.trim().slice(0, 5000) : "";
    if (!text) return "";
    if (/(<|>|@import|url\s*\(|javascript:|expression\s*\()/i.test(text)) return "";
    return text;
}

function buildFallbackReply(payload) {
    const question = cleanText(payload.prompt, 500).toLowerCase();
    const content = cleanText(payload.pageContent, MAX_PAGE_CHARS);
    const title = cleanText(payload.title, 200);

    // If no page content at all, still provide a polite message
    if (!content && !title) {
        return "ขออภัยครับ ขณะนี้ระบบ AI หลักไม่สามารถเชื่อมต่อได้ชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ครับ";
    }

    const keywords = question
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length > 1);

    // Extract chunks using both keyword-based and general content extraction
    const keywordChunks = extractContentChunks(content, keywords);
    const generalChunks = extractGeneralChunks(content);

    // Prefer keyword-matched chunks, then fall back to general content
    const lines = keywordChunks.length ? keywordChunks.slice(0, 6) : generalChunks.slice(0, 5);

    const intro = "ขออภัยครับ ขณะนี้ระบบ AI หลักมีผู้ใช้งานเยอะ แต่ผมอ่านข้อมูลบนหน้านี้ให้ได้ครับ:";

    if (!lines.length && title) {
        return `${intro}\n\nหน้านี้คือ "${title}" — กรุณาลองถามใหม่อีกครั้งในอีกสักครู่ เมื่อระบบ AI พร้อมให้บริการครับ`;
    }

    if (!lines.length) {
        return "ขออภัยครับ ขณะนี้ระบบ AI หลักไม่สามารถเชื่อมต่อได้ชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ครับ";
    }

    return [
        intro,
        "",
        ...lines.map((line) => `- ${line}`)
    ].join("\n");
}

function extractContentChunks(content, keywords) {
    const source = String(content || "");
    if (!source || !keywords || !keywords.length) return [];

    const chunks = [];

    for (const word of keywords) {
        if (word.length < 2) continue;
        let searchIndex = 0;

        while (chunks.length < 16) {
            const pos = source.toLowerCase().indexOf(word.toLowerCase(), searchIndex);
            if (pos === -1) break;

            const start = Math.max(0, pos - 40);
            const end = Math.min(source.length, pos + 180);
            const chunk = source.slice(start, end).replace(/\s+/g, " ").trim();

            if (chunk.length > 8 && !chunks.some((item) => item.includes(chunk) || chunk.includes(item))) {
                chunks.push(chunk);
            }

            searchIndex = pos + word.length;
        }
    }

    return chunks;
}

function extractGeneralChunks(content) {
    const source = String(content || "");
    if (!source || source.length < 10) return [];

    const chunks = [];

    // Split content into meaningful sentences/segments
    const segments = source
        .split(/[.!?\n\r;。！？]+/)
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter((s) => s.length > 15 && s.length < 300);

    // Take the first few meaningful segments as a summary
    for (const seg of segments) {
        if (chunks.length >= 8) break;
        if (!chunks.some((item) => item.includes(seg) || seg.includes(item))) {
            chunks.push(seg);
        }
    }

    return chunks;
}

function toPublicGeminiError(statusCode) {
    const error = new Error("Gemini API failed");
    error.statusCode = statusCode === 429 ? 429 : 500;

    if (statusCode === 400) {
        error.publicMessage = "คำถามนี้ยังตอบไม่ได้ กรุณาลองถามใหม่ให้ชัดเจนขึ้น";
    } else if (statusCode === 401 || statusCode === 403) {
        error.publicMessage = "API Key ยังใช้งานไม่ได้ กรุณาตรวจสอบการตั้งค่าระบบ";
    } else if (statusCode === 429) {
        error.publicMessage = "ขณะนี้มีการใช้งานเยอะ กรุณารอสักครู่แล้วลองใหม่";
    } else {
        error.publicMessage = "เกิดข้อผิดพลาดจาก AI กรุณาลองใหม่อีกครั้ง";
    }

    return error;
}
