// Safety & PII Service

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

function maskDOMSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return snapshot;
    let masked = {};
    for (let key in snapshot) {
        if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
            let val = snapshot[key];
            if (typeof val === "string") masked[key] = maskPII(val);
            else if (Array.isArray(val)) masked[key] = val.map(v => typeof v === "string" ? maskPII(v) : v);
            else masked[key] = val;
        }
    }
    return masked;
}

function checkZeroTrust(phase1Result, payload) {
    let result = { safe: true, reason: "", confirmationRequired: false };
    let targetText = (phase1Result && phase1Result.targetText) || "";
    let intent = (phase1Result && phase1Result.intent) || "";
    let actionType = (phase1Result && phase1Result.actionType) || "null";

    let checkText = (targetText + " " + intent).toLowerCase();

    const sensitivePatterns = [
        { re: /password|credential|ssn|sin|token|secret|api.?key/i, label: "credentials/secrets" },
        { re: /checkout|payment|pay|billing|check.?out/i, label: "payment flow" },
        { re: /login|signin|sign.?in|log.?in/i, label: "authentication" },
        { re: /admin|administrator|dashboard.*admin/i, label: "admin access" },
        { re: /iframe|embed.*frame/i, label: "embedded frame" },
        { re: /download|export.*file|attachment/i, label: "file download" },
        { re: /javascript:|onclick=|onload=|script.*src/i, label: "script injection" },
        { re: /credit.?card|card.?number|cvv|cvc|card.?payment/i, label: "financial data" }
    ];

    for (let i = 0; i < sensitivePatterns.length; i++) {
        if (sensitivePatterns[i].re.test(checkText)) {
            if (actionType !== "null" && actionType !== "answer" && actionType !== "speech") {
                result.safe = false;
                result.reason = "references sensitive area: " + sensitivePatterns[i].label + " (Active Action: " + actionType + ")";
                result.confirmationRequired = true;
                return result;
            } else {
                result.confirmationRequired = true;
            }
        }
    }
    return result;
}

module.exports = {
    UNIVERSAL_SAFETY_RULES,
    maskPII,
    maskDOMSnapshot,
    checkZeroTrust
};
