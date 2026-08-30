'use strict';

/*
 * Lightweight language-understanding utilities for website requests.
 * This is deliberately bounded: it corrects common surface variations and
 * scores close matches against words the current website actually publishes.
 * It never invents a product, page, or fact that is not in site knowledge.
 */

const COMMON_VARIANTS = [
    [/อยากด้าย/giu, 'อยากได้'],
    [/ต้องกาน/giu, 'ต้องการ'],
    [/มั้ย|มัย|ไหม๊/giu, 'ไหม'],
    [/ม่าย|ม้าย/giu, 'ไม่'],
    [/กางแกง/giu, 'กางเกง'],
    [/รองเท้าวิ้ง/giu, 'รองเท้าวิ่ง'],
    [/โทสับ|โทรสับ|โทรสัพ/giu, 'โทรศัพท์'],
    [/กะเป๋า/giu, 'กระเป๋า'],
    [/สนีกเกอร์|sneakers?/giu, 'รองเท้า'],
    [/แพงมะ|แพงป่าว|กี่บาท/giu, 'ราคาเท่าไหร่'],
    [/(?:เเพ็คเกจ|เเพกเกจ|เเพคเกจ|แพ็คเกจ|แพคเกจ|แพกเกจ|package)/giu, 'แพ็กเกจ']
];

const SCENARIO_MAPPINGS = [
    // Weather & Environment
    [/(?:ฝนตก|หน้าฝน|เปียกน้ำ|ลุยน้ำ)/giu, 'กันน้ำ'],
    [/(?:หน้าหนาว|อากาศเย็น|ไปต่างประเทศ|ลุยหิมะ|สู้ความหนาว)/giu, 'กันหนาว'],
    [/(?:หน้าร้อน|ไปทะเล|อากาศร้อน|ซัมเมอร์)/giu, 'ระบายอากาศ'],
    // Pain Points & Ergonomics
    [/(?:ยืนนาน|เดินเยอะ|ปวดเท้า|เมื่อย|รองช้ำ|เจ็บเท้า)/giu, 'นุ่ม ซัพพอร์ต'],
    // Use Cases
    [/(?:ให้แฟน|ของขวัญ|วันเกิด|จับฉลาก|ปีใหม่)/giu, 'ของขวัญ'],
    [/(?:ออกกำลัง|ฟิตเนส|เล่นกีฬา|วิ่งมาราธอน)/giu, 'กีฬา'],
    [/(?:ใส่ทำงาน|ออฟฟิศ|ทางการ|สุภาพ)/giu, 'ทำงาน'],
    // Quality & Value
    [/(?:พังง่าย|ถึก|ทนมือ|สมบุกสมบัน)/giu, 'ทนทาน'],
    [/(?:งบน้อย|ไม่แพง|ราคาประหยัด|งบจำกัด|หลักร้อย)/giu, 'ราคาถูก']
];

function normalizeHumanText(value) {
  let text = String(value || '').normalize('NFKC').toLocaleLowerCase('th-TH');
  // Unicode NFKC decomposes the Thai vowel sara am (ำ) into า + ํ. Recompose
  // it so natural-language rules written with normal Thai spelling continue
  // to match what customers type.
  text = text.replace(/\u0E4D\u0E32/gu, '\u0E33');
  text = text.replace(/[\u200B-\u200D\uFEFF]/gu, '').replace(/\s+/g, ' ').trim();
    for (const [pattern, replacement] of SCENARIO_MAPPINGS) text = text.replace(pattern, replacement);
    for (const [pattern, replacement] of COMMON_VARIANTS) text = text.replace(pattern, replacement);
    return text;
}

function compact(value) {
    return normalizeHumanText(value).replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

function levenshtein(left, right, maxDistance) {
    if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row++) {
        const current = [row];
        let minimum = current[0];
        for (let column = 1; column <= right.length; column++) {
            const cost = left[row - 1] === right[column - 1] ? 0 : 1;
            const value = Math.min(
                previous[column] + 1,
                current[column - 1] + 1,
                previous[column - 1] + cost
            );
            current[column] = value;
            minimum = Math.min(minimum, value);
        }
        if (minimum > maxDistance) return maxDistance + 1;
        previous = current;
    }
    return previous[right.length];
}

function closestDistance(query, phrase) {
    const source = compact(query).slice(0, 220);
    const target = compact(phrase);
    if (target.length < 4 || source.length < target.length - 1) return Infinity;
    if (source.includes(target)) return 0;
    const allowed = target.length >= 10 ? 2 : 1;
    let best = Infinity;
    for (let width = Math.max(4, target.length - allowed); width <= target.length + allowed; width++) {
        for (let start = 0; start <= source.length - width; start++) {
            const distance = levenshtein(source.slice(start, start + width), target, allowed);
            if (distance < best) best = distance;
            if (best === 0) return 0;
        }
    }
    return best;
}

function fuzzyPhraseScore(query, phrases = []) {
    let best = 0;
    for (const phrase of phrases) {
        const candidate = compact(phrase);
        if (candidate.length < 4) continue;
        const distance = closestDistance(query, candidate);
        if (distance === 0) best = Math.max(best, 56 + Math.min(candidate.length, 10));
        else if (distance === 1) best = Math.max(best, 46 + Math.min(candidate.length, 10));
        else if (distance === 2 && candidate.length >= 10) best = Math.max(best, 38 + Math.min(candidate.length, 10));
    }
    return best;
}

function productPhrases(product, cues = []) {
    const values = [product && product.name, ...(product && product.keywords || [])]
        .filter(Boolean)
        .flatMap(value => String(value).split(/[\s,\/|()]+/u));
    const haystack = normalizeHumanText(`${product && product.name || ''} ${product && product.description || ''} ${(product && product.keywords || []).join(' ')}`);
    cues.forEach(cue => { if (haystack.includes(cue)) values.push(cue); });
    return [...new Set(values.map(value => normalizeHumanText(value)).filter(value => compact(value).length >= 4))];
}

module.exports = { normalizeHumanText, fuzzyPhraseScore, productPhrases };
