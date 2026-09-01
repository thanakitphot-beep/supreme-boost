"use strict";

var PATTERNS = {
    pricing: /(?:ราคา|แพ็กเกจ|ค่าบริการ|รายเดือน|รายปี|บาท|฿|\b(?:pricing|price|package|plan|monthly|annual|starter|enterprise)\b)/i,
    purchase: /(?:ซื้อ|สั่งซื้อ|ตะกร้า|ชำระเงิน|สมัคร|เริ่มใช้งาน|จอง|\b(?:buy|order|cart|checkout|subscribe|book)\b|\bsign\s?up\b|\bget\s?started\b)/i,
    product: /(?:สินค้า|บริการ|รุ่น|รายละเอียด|สเปก|\b(?:product|service|model|details|specification)\b)/i,
    feature: /(?:ฟีเจอร์|ความสามารถ|รองรับ|เชื่อมต่อ|ประโยชน์|\b(?:feature|integration|plugin|capability|benefit)\b)/i,
    support: /(?:ติดต่อ|สอบถาม|ช่วยเหลือ|คำถามที่พบบ่อย|\b(?:contact|support|help|faq)\b)/i,
    trust: /(?:รีวิว|ลูกค้าใช้จริง|รับประกัน|ผลงาน|กรณีศึกษา|\b(?:review|testimonial|guarantee)\b|\bcase\s?study\b)/i
};

function clean(value, max) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 120);
}

function detectIntent(input) {
    input = input || {};
    var text = clean(input.text, 700).toLowerCase();
    var type = clean(input.type, 40).toLowerCase();
    var custom = clean(input.customIntent, 40).toLowerCase();
    var scores = { pricing: 0, purchase: 0, product: 0, feature: 0, support: 0, trust: 0, content: 0 };

    if (Object.prototype.hasOwnProperty.call(scores, custom)) scores[custom] += 10;
    Object.keys(PATTERNS).forEach(function (intent) {
        if (PATTERNS[intent].test(text)) scores[intent] += intent === "pricing" || intent === "purchase" ? 5 : 4;
    });

    if (type === "pricing") scores.pricing += 5;
    if (type === "catalog") scores.product += 3;
    if (type === "form") scores.purchase += 2;
    if (type === "article") scores.content += 2;
    if (type === "interactive") scores.content += 1;

    var priority = ["purchase", "pricing", "product", "support", "feature", "trust", "content"];
    var winner = priority[0];
    priority.forEach(function (intent) {
        if (scores[intent] > scores[winner]) winner = intent;
    });
    if (scores[winner] === 0) winner = "content";

    var visits = Math.max(1, Number(input.visits) || 1);
    var duration = Math.max(0, Number(input.duration) || 0);
    var clicks = Math.max(0, Number(input.clicks) || 0);
    var related = Array.isArray(input.relatedIntents)
        ? input.relatedIntents.filter(function (intent) { return intent === winner; }).length
        : 0;
    var score = scores[winner] + Math.min(2, visits - 1) + Math.min(2, clicks);
    if (duration >= 2500) score += 1;
    if (related > 0) score += 2;

    return { intent: winner, score: score, relatedCount: related, scores: scores };
}

function isSemanticContainer(input) {
    input = input || {};
    if (input.explicit) return true;
    var tag = clean(input.tag, 30).toUpperCase();
    var role = clean(input.role, 40).toLowerCase();
    if (tag === "ARTICLE" || tag === "FORM" || tag === "SECTION" || role === "article") return true;
    var className = clean(input.className, 300).toLowerCase();
    var semantic = /(^|[\s_-])(card|product|pricing|package|plan|service|feature)([\s_-]|$)/i.test(className);
    var leaf = /(^|[\s_-])(title|name|price|image|icon|description|content|body|meta|action|button|label)([\s_-]|$)/i.test(className);
    return semantic && !leaf;
}

function thaiRecommendation(intent, label, price, compared) {
    var named = label ? " “" + label + "”" : "";
    if (intent === "pricing") {
        if (compared) return {
            message: "กำลังเทียบ" + named + "กับตัวเลือกอื่นอยู่ใช่ไหมครับ? ผมช่วยสรุปราคาและความต่างให้ตรงกับการใช้งานได้",
            prompt: "ช่วยเปรียบเทียบตัวเลือกที่ฉันกำลังดู และแนะนำตัวที่เหมาะกับการใช้งาน"
        };
        return {
            message: "สนใจ" + (named || "ตัวเลือกนี้") + "อยู่ใช่ไหมครับ? " + (price ? "ราคา " + price + " " : "") + "ผมช่วยเช็กความคุ้มค่าและเงื่อนไขให้ได้",
            prompt: "ช่วยสรุปราคา ความคุ้มค่า และเงื่อนไขของ" + (named || "ตัวเลือกนี้")
        };
    }
    if (intent === "purchase") return {
        message: "กำลังตัดสินใจ" + (named || "เริ่มใช้งาน") + "อยู่ใช่ไหมครับ? ผมช่วยเช็กขั้นตอน ราคา และเงื่อนไขก่อนดำเนินการได้",
        prompt: "ช่วยบอกขั้นตอน ราคา และเงื่อนไขของ" + (named || "สิ่งที่ฉันกำลังดู")
    };
    if (intent === "product") return {
        message: "กำลังดู" + (named || "รายการนี้") + "อยู่ใช่ไหมครับ? ผมช่วยสรุปจุดเด่น ราคา และตัวเลือกใกล้เคียงได้",
        prompt: "ช่วยสรุปจุดเด่น ราคา และตัวเลือกใกล้เคียงของ" + (named || "รายการนี้")
    };
    if (intent === "feature") return {
        message: "สนใจ" + (named || "ฟีเจอร์นี้") + "ใช่ไหมครับ? ผมช่วยบอกว่าเหมาะกับงานแบบไหนและใช้อย่างไรได้",
        prompt: "ช่วยอธิบายประโยชน์และวิธีใช้" + (named || "ฟีเจอร์นี้")
    };
    if (intent === "support") return {
        message: "กำลังหาความช่วยเหลือเรื่อง" + (named || "นี้") + "อยู่หรือเปล่าครับ? ผมช่วยหาคำตอบหรือช่องทางติดต่อให้ได้",
        prompt: "ช่วยหาคำตอบหรือช่องทางติดต่อเกี่ยวกับ" + (named || "เรื่องนี้")
    };
    if (intent === "trust") return {
        message: "กำลังเช็กความน่าเชื่อถือ" + (named || "อยู่") + "ใช่ไหมครับ? ผมช่วยสรุปรีวิว จุดเด่น และข้อควรพิจารณาได้",
        prompt: "ช่วยสรุปรีวิว จุดเด่น และข้อควรพิจารณาของ" + (named || "สิ่งนี้")
    };
    return {
        message: "กำลังอ่านเรื่อง" + (named || "นี้") + "อยู่ใช่ไหมครับ? ผมช่วยสรุปใจความสำคัญให้ได้",
        prompt: "ช่วยสรุปใจความสำคัญของ" + (named || "ส่วนนี้")
    };
}

function englishRecommendation(intent, label, price, compared) {
    var named = label ? ' "' + label + '"' : "";
    if (intent === "pricing") {
        if (compared) return {
            message: "Comparing" + named + " with other options? I can summarize the prices and differences for your use case.",
            prompt: "Compare the options I am viewing and recommend the best fit for my use case."
        };
        return {
            message: "Interested in" + (named || " this option") + "? " + (price ? "At " + price + ", " : "") + "I can check the value and important terms.",
            prompt: "Summarize the price, value, and terms for" + (named || " this option") + "."
        };
    }
    if (intent === "purchase") return {
        message: "Considering" + (named || " getting started") + "? I can check the steps, price, and terms before you continue.",
        prompt: "Explain the steps, price, and terms for" + (named || " what I am viewing") + "."
    };
    if (intent === "product") return {
        message: "Looking at" + (named || " this item") + "? I can summarize its highlights, price, and similar options.",
        prompt: "Summarize the highlights, price, and similar options for" + (named || " this item") + "."
    };
    if (intent === "feature") return {
        message: "Interested in" + (named || " this feature") + "? I can explain when it is useful and how it works.",
        prompt: "Explain the benefits and usage of" + (named || " this feature") + "."
    };
    if (intent === "support") return {
        message: "Looking for help with" + (named || " this") + "? I can find the answer or the right contact channel.",
        prompt: "Find the answer or contact channel for" + (named || " this topic") + "."
    };
    if (intent === "trust") return {
        message: "Checking credibility" + (named ? " for" + named : "") + "? I can summarize reviews, strengths, and considerations.",
        prompt: "Summarize the reviews, strengths, and considerations for" + (named || " this") + "."
    };
    return {
        message: "Reading about" + (named || " this topic") + "? I can summarize the key points.",
        prompt: "Summarize the key points of" + (named || " this section") + "."
    };
}

function buildRecommendation(input) {
    input = input || {};
    var customHint = clean(input.customHint, 180);
    var result = detectIntent(input);
    if (!customHint && result.score < 3) return null;

    var label = clean(input.label, 70);
    var price = clean(input.price, 40);
    var recommendation = String(input.locale || "en").toLowerCase().indexOf("th") === 0
        ? thaiRecommendation(result.intent, label, price, result.relatedCount > 0)
        : englishRecommendation(result.intent, label, price, result.relatedCount > 0);

    if (customHint) recommendation.message = customHint;
    return {
        intent: result.intent,
        score: customHint ? Math.max(10, result.score) : result.score,
        message: clean(recommendation.message, 180),
        prompt: clean(recommendation.prompt, 180)
    };
}

module.exports = { detectIntent: detectIntent, buildRecommendation: buildRecommendation, isSemanticContainer: isSemanticContainer };
