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

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("GEMINI_API_KEY is not configured.");
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

        try {
            const aiData = await askGemini(apiKey, payload);
            return res.status(200).json(aiData);
        } catch (error) {
            const fallbackReply = buildFallbackReply(payload);
            if (fallbackReply) {
                console.error("Gemini failed, using page-content fallback:", error);
                return res.status(200).json({ reply: fallbackReply, cssCommand: "" });
            }
            throw error;
        }
    } catch (error) {
        console.error("Supreme AI server error:", error);
        const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
        return res.status(status).json({
            error: error.publicMessage || "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง"
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
            cssCommand: sanitizeCss(parsed.cssCommand)
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

    if (!content) return "";
    if (!/(สินค้า|มีอะไร|แบบ|เสื้อ|กางเกง|หมวก|ราคา|โปร|promotion|product|price)/i.test(question)) {
        return "";
    }

    const keywords = question
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((word) => word.length > 1);

    const chunks = extractContentChunks(content);

    const matched = chunks.filter((chunk) => keywords.some((word) => chunk.toLowerCase().includes(word)));
    const productLike = chunks.filter((chunk) => /(บาท|ราคา|เสื้อ|กางเกง|หมวก|สินค้า|โปรโมชัน|ส่งฟรี)/i.test(chunk));
    const lines = (matched.length ? matched : productLike).slice(0, 5);

    if (!lines.length) return "";

    return [
        "ตอนนี้ระบบ AI หลักเชื่อมต่อไม่ได้ชั่วคราว แต่ผมอ่านข้อมูลบนหน้านี้ให้ได้ครับ:",
        "",
        ...lines.map((line) => `- ${line}`)
    ].join("\n");
}

function extractContentChunks(content) {
    const source = String(content || "");
    const chunks = [];
    const pattern = /(เสื้อ|กางเกง|หมวก|สินค้า|ราคา|โปรโมชัน|ส่งฟรี|บาท)/gi;
    let match;

    while ((match = pattern.exec(source)) !== null && chunks.length < 16) {
        const start = Math.max(0, match.index - 24);
        const end = Math.min(source.length, match.index + 170);
        const chunk = source.slice(start, end).replace(/\s+/g, " ").trim();
        if (chunk.length > 8 && !chunks.some((item) => item.includes(chunk) || chunk.includes(item))) {
            chunks.push(chunk);
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
