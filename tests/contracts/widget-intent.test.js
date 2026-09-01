const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { detectIntent, buildRecommendation, isSemanticContainer } = require('../../src/widget/intentEngine');

describe('Intent-aware proactive recommendations', () => {
    test('recognizes repeated plan comparison and names the focused plan', () => {
        const result = buildRecommendation({
            text: 'แพ็กเกจ Pro ราคา ฿990 ต่อเดือน',
            type: 'pricing',
            label: 'Pro',
            price: '฿990',
            locale: 'th',
            visits: 2,
            duration: 5000,
            relatedIntents: ['pricing']
        });

        expect(result.intent).toBe('pricing');
        expect(result.score).toBeGreaterThanOrEqual(10);
        expect(result.message).toContain('กำลังเทียบ');
        expect(result.message).toContain('Pro');
        expect(result.prompt).toContain('เปรียบเทียบ');
    });

    test('separates purchase, product, and feature purposes', () => {
        expect(detectIntent({ text: 'สมัครใช้งานเลย', type: 'form' }).intent).toBe('purchase');
        expect(detectIntent({ text: 'รายละเอียดสินค้า รุ่นใหม่', type: 'catalog' }).intent).toBe('product');
        expect(detectIntent({ text: 'ฟีเจอร์เชื่อมต่อระบบ', type: 'content' }).intent).toBe('feature');
        expect(detectIntent({ text: 'Buy the Pro plan', type: 'interactive' }).intent).toBe('purchase');
        expect(detectIntent({ text: 'Planetary research model', type: 'content' }).intent).not.toBe('pricing');
    });

    test('stays silent for weak generic hover signals', () => {
        expect(buildRecommendation({ text: 'อ่านเพิ่มเติม', type: 'content', locale: 'th' })).toBeNull();
    });

    test('offers a summary after sustained article interest', () => {
        const result = buildRecommendation({
            text: 'แนวทางเลือก AI สำหรับธุรกิจ',
            type: 'article',
            label: 'แนวทางเลือก AI',
            locale: 'th',
            visits: 1,
            duration: 2500
        });

        expect(result.intent).toBe('content');
        expect(result.message).toContain('แนวทางเลือก AI');
    });

    test('honors a site-provided hint without needing a high inferred score', () => {
        const result = buildRecommendation({
            text: 'Custom area',
            customIntent: 'support',
            customHint: 'ต้องการให้ช่วยเลือกเวลานัดหมายไหมครับ?',
            locale: 'th'
        });

        expect(result.intent).toBe('support');
        expect(result.message).toBe('ต้องการให้ช่วยเลือกเวลานัดหมายไหมครับ?');
    });

    test('groups semantic cards instead of their title or price children', () => {
        expect(isSemanticContainer({ tag: 'DIV', className: 'product-card' })).toBe(true);
        expect(isSemanticContainer({ tag: 'DIV', className: 'product-title' })).toBe(false);
        expect(isSemanticContainer({ tag: 'SPAN', className: 'pricing-card__price' })).toBe(false);
        expect(isSemanticContainer({ tag: 'DIV', className: 'feature-card' })).toBe(true);
        expect(isSemanticContainer({ tag: 'DIV', explicit: true })).toBe(true);
    });

    test('keeps hover inference local and applies anti-spam controls', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        const hesitation = source.slice(
            source.indexOf('Observer.onHesitation = function'),
            source.indexOf('Observer.onFrustration = function')
        );

        expect(source).toContain('new WeakMap()');
        expect(source).toContain('INTENT_NUDGE_COOLDOWN_MS');
        expect(source).toContain('INTENT_TARGET_COOLDOWN_MS');
        expect(source).toContain('MAX_INTENT_NUDGES');
        expect(source).toContain('data-indicator-intent');
        expect(source).toContain('containsSensitiveArea');
        expect(source).toContain('pending.prompt');
        expect(source).toContain('type !== "hesitation"');
        expect(source).toContain('this._el.style.pointerEvents = "none"');
        expect(source).toContain('VisitorIntent.buildRecommendation');
        expect(hesitation).toContain('contextualNudge');
        expect(hesitation).toContain('Observer.canRecommend');
        expect(hesitation).not.toContain('doProactive(');
    });

    test('prefills an intent prompt without submitting it automatically', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        const clickHandler = source.slice(
            source.indexOf('whisper.addEventListener("click"'),
            source.indexOf('setTimeout(function () { if (!state.open)')
        );

        expect(clickHandler).toContain('input.value = pending.prompt');
        expect(clickHandler).not.toContain('sendMsg(');
        expect(clickHandler).not.toContain('requestSubmit');
    });

    test('production build bundles the intent engine into boost.js output', async () => {
        const result = await esbuild.build({
            entryPoints: [path.resolve(__dirname, '../../src/widget/main.js')],
            bundle: true,
            minify: true,
            write: false,
            target: ['es2015'],
            format: 'iife'
        });
        const bundle = result.outputFiles[0].text;

        expect(bundle).toContain('data-indicator-intent');
        expect(bundle).toContain('data-indicator-hint');
        expect(bundle).toContain('WeakMap');
    });
});
