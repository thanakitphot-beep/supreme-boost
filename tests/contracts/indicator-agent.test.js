const { runIndicatorAgent } = require('../../services/indicatorAgent');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolveSiteProfile, originIsAllowed, inferSiteIdentity } = require('../../services/siteProfiles');

describe('INDICATOR owned agent — contract', () => {
    test('finds an INDICATOR subscription plan', () => {
        const result = runIndicatorAgent({
            prompt: 'ช่วยหาแพ็กเกจ Pro Matrix ให้หน่อย',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        expect(result.status).toBe('ok');
        expect(result.reply).toContain('แพ็กเกจ Pro Matrix');
        expect(result.action).toMatchObject({ type: 'navigate', url: '/pricing.html#pro' });
        expect(result.cssCommand).toBe('');
    });

    test('understands a natural plan request without requiring the word package', () => {
        const result = runIndicatorAgent({
            prompt: 'อยากได้ Pro Matrix',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        expect(result.reply).toContain('แพ็กเกจ Pro Matrix');
        expect(result.action).toMatchObject({ type: 'navigate' });
    });

    test('checks the site before answering an availability question outside known product categories', () => {
        const result = runIndicatorAgent({
            prompt: 'ร้านนี้มีต้นไม้ไหม',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        expect(result.reply).toContain('กำลังตรวจสอบว่าในร้านนี้มี “ต้นไม้” หรือไม่');
        expect(result.action).toMatchObject({ type: 'warp', searchAll: true, showResults: true });
        expect(result.action.keywords).toContain('ต้นไม้');
    });

    test('lists recommendations without navigating to an unrelated webpage', () => {
        const result = runIndicatorAgent({
            prompt: 'ร้านนี้มีอะไรแนะนำบ้าง',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        expect(result.reply).toContain('รายการที่น่าสนใจ');
        expect(result.action).toBeNull();
        expect(result.interactive).toMatchObject({ type: 'carousel' });
        expect(result.interactive.items.length).toBeGreaterThan(0);
    });

    test('searches the current catalog before crawling when a Thai product request is imprecise', () => {
        const result = runIndicatorAgent({
            prompt: 'อยากได้แบบกางเกง 3 ส่วน',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST'),
            siteDNA: {
                entities: [
                    'กางเกงชิโน่ Slim Fit (฿1,090)',
                    'กางเกงขาสั้นลินิน (฿690)',
                    'กางเกงวอร์ม 3 ส่วน (฿690)'
                ]
            }
        });
        expect(result.reply).toContain('กางเกงวอร์ม 3 ส่วน');
        expect(result.action).toMatchObject({ type: 'warp', targetText: 'กางเกงวอร์ม 3 ส่วน' });
        expect(result.sources[0]).toMatchObject({ type: 'catalog', id: 'visible-3' });
    });

    test('answers a category question with matching products instead of a page summary', () => {
        const result = runIndicatorAgent({
            prompt: 'มีกางเกงอะไรบ้าง',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: { id: 'unit-category-list', permissions: ['navigate_same_origin'] },
            siteDNA: {
                entities: [
                    'กางเกงชิโน่ Slim Fit (฿1,090)',
                    'กางเกงขาสั้นลินิน (฿690)',
                    'กางเกงวอร์ม 3 ส่วน (฿690)'
                ]
            }
        });
        expect(result.reply).toContain('ในร้านนี้พบ 3 รายการ');
        expect(result.reply).toContain('กางเกงวอร์ม 3 ส่วน');
        expect(result.action).toBeNull();
        expect(result.interactive.items).toHaveLength(3);
    });

    test('tolerates Thai spelling variation while retaining the customer product constraint', () => {
        const result = runIndicatorAgent({
            prompt: 'อยากด้ายกางแกงวอม 3 ส่วน',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: { id: 'unit-typo-match', permissions: ['navigate_same_origin'] },
            siteDNA: {
                entities: [
                    'กางเกงชิโน่ Slim Fit (฿1,090)',
                    'กางเกงวอร์ม 3 ส่วน (฿690)'
                ]
            }
        });
        expect(result.reply).toContain('กางเกงวอร์ม 3 ส่วน');
        expect(result.action).toMatchObject({ type: 'warp', targetText: 'กางเกงวอร์ม 3 ส่วน' });
    });

    test('navigates to a known same-origin page', () => {
        const result = runIndicatorAgent({
            prompt: 'พาไปหน้าสมัครใช้งาน AI Chat Widget',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        expect(result.action).toMatchObject({ type: 'navigate', url: '/pricing.html' });
    });

    test('blocks autonomous payment navigation', () => {
        const result = runIndicatorAgent({ prompt: 'พาฉันไป checkout เพื่อจ่ายเงิน', locale: 'th' });
        expect(result.status).toBe('blocked');
        expect(result.action).toBeNull();
    });

    test('does not mistake ordinary content containing "Designing" for sign-in', () => {
        const profile = resolveSiteProfile('INDICATOR_ISOLATED_DEMO');
        const result = runIndicatorAgent({
            prompt: 'หา Designing Calm Interfaces ให้หน่อย',
            url: 'https://books.example/',
            locale: 'th',
            siteProfile: profile
        });
        expect(result.status).toBe('ok');
        expect(result.reply).toContain('Designing Calm Interfaces');
    });

    test('uses the last assistant reply to answer a follow-up plan question', () => {
        const first = runIndicatorAgent({
            prompt: 'ช่วยหาแพ็กเกจ Pro Matrix ให้หน่อย',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        const followUp = runIndicatorAgent({
            prompt: 'มันคือแพ็กเกจอะไร',
            url: 'http://localhost:3000/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST'),
            history: [
                { role: 'user', text: 'ช่วยหาแพ็กเกจ Pro Matrix ให้หน่อย' },
                { role: 'assistant', text: first.reply }
            ]
        });
        expect(followUp.reply).toContain('แพ็กเกจ Pro Matrix คือ');
        expect(followUp.reply).toContain('10,000 ข้อความ');
        expect(followUp.sources[0]).toMatchObject({ type: 'conversation_catalog', id: 'plan-pro' });
    });

    test('keeps plan-detail follow-ups grounded and requests optional research', () => {
        const profile = resolveSiteProfile('INDICATOR_TEST');
        const first = runIndicatorAgent({
            prompt: 'ช่วยหาแพ็กเกจ Pro Matrix ให้หน่อย', url: 'http://localhost:3000/', locale: 'th', siteProfile: profile
        });
        const result = runIndicatorAgent({
            prompt: 'เหมาะกับอะไร', url: 'http://localhost:3000/', locale: 'th', siteProfile: profile,
            history: [{ role: 'assistant', text: first.reply }]
        });
        expect(result.reply).toContain('ยังไม่มีข้อมูลยืนยัน');
        expect(result.reply).toContain('แพ็กเกจ Pro Matrix');
        expect(result.researchRequest).toMatchObject({ subject: 'แพ็กเกจ Pro Matrix', question: 'เหมาะกับอะไร' });
    });

    test('uses cited external research only when the server supplies it', () => {
        const profile = resolveSiteProfile('INDICATOR_TEST');
        const result = runIndicatorAgent({
            prompt: 'เหมาะกับอะไร', url: 'http://localhost:3000/', locale: 'th', siteProfile: profile,
            history: [{ role: 'assistant', text: 'เจอ แพ็กเกจ Pro Matrix ราคา 2,490 บาท ครับ' }],
            externalResearch: { results: [{ title: 'Independent review', snippet: 'Reviewer recommends the plan for growing websites.', url: 'https://reviews.example/pro-matrix' }] }
        });
        expect(result.reply).toContain('Independent review');
        expect(result.sources[0]).toMatchObject({ type: 'external_research', url: 'https://reviews.example/pro-matrix' });
    });

    test('searches the rest of the site when a requested product is not indexed on this page', () => {
        const result = runIndicatorAgent({
            prompt: 'พาไปดูรองเท้าปีนเขาหน่อยมีอะไรบ้าง',
            url: 'https://shop.example/home',
            locale: 'th',
            siteProfile: { permissions: ['search_catalog', 'navigate_same_origin'] }
        });
        expect(result.reply).toContain('ค้นหา');
        expect(result.action).toMatchObject({ type: 'warp', searchAll: true, showResults: true });
        expect(result.action.keywords).toContain('รองเท้า');
        expect(result.sources[0]).toMatchObject({ type: 'site_search' });
    });

    test('answers a general question from a learned public website page', () => {
        const result = runIndicatorAgent({
            prompt: 'ร้านเปิดวันไหน',
            url: 'https://books.example/',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_ISOLATED_DEMO'),
            expertKnowledge: {
                pages: [{
                    id: 'learned-page-1',
                    learned: true,
                    title: 'การติดต่อร้าน Orbit',
                    url: '/contact',
                    headings: ['เวลาทำการ'],
                    content: 'ร้านเปิดทุกวัน 09:00-18:00 น. และรับข้อความผ่านหน้า Contact',
                    keywords: ['เวลาทำการ', 'เปิดทุกวัน', 'ติดต่อ']
                }],
                catalog: [],
                glossary: []
            }
        });
        expect(result.reply).toContain('ร้านเปิดทุกวัน 09:00-18:00');
        expect(result.sources[0]).toMatchObject({ type: 'learned_public_page', url: '/contact' });
        expect(result.action).toMatchObject({ type: 'navigate', url: '/contact' });
    });

    test('answers from tenant knowledge and cites the tenant-owned chunk', () => {
        const result = runIndicatorAgent({
            prompt: 'ร้านเปิดวันไหน',
            url: 'https://shop.example/',
            locale: 'th',
            siteProfile: { id: 'tenant-knowledge-test', permissions: ['navigate_same_origin'] },
            tenantKnowledge: [{
                id: 'tenant-hours-1',
                title: 'เวลาทำการร้าน',
                source: 'https://shop.example/contact',
                content: 'ร้านเปิดทุกวัน 09:00-18:00 น. ติดต่อทีมงานได้ผ่านหน้า Contact',
                score: 24
            }]
        });
        expect(result.reply).toContain('ร้านเปิดทุกวัน 09:00-18:00');
        expect(result.sources[0]).toMatchObject({ type: 'tenant_knowledge', id: 'tenant-hours-1', url: '/contact' });
        expect(result.action).toMatchObject({ type: 'navigate', url: '/contact' });
    });

    test('cites an external tenant knowledge source without navigating away from the site', () => {
        const result = runIndicatorAgent({
            prompt: 'นโยบายคืนสินค้าคืออะไร',
            url: 'https://shop.example/',
            locale: 'th',
            siteProfile: { id: 'tenant-external-knowledge', permissions: ['navigate_same_origin'] },
            tenantKnowledge: [{
                id: 'tenant-return-policy',
                title: 'นโยบายคืนสินค้า',
                source: 'https://policy.example/returns',
                content: 'รับคืนสินค้าภายใน 30 วัน เมื่อมีหลักฐานการสั่งซื้อและสินค้าอยู่ในสภาพเดิม',
                score: 20
            }]
        });
        expect(result.reply).toContain('รับคืนสินค้าภายใน 30 วัน');
        expect(result.sources[0]).toMatchObject({ type: 'tenant_knowledge', id: 'tenant-return-policy', url: 'https://policy.example/returns' });
        expect(result.action).toBeNull();
    });

    test('keeps the widget response schema', () => {
        const result = runIndicatorAgent({ prompt: 'สรุปหน้านี้', pageContent: 'ข้อมูลสำคัญของหน้าปัจจุบัน', locale: 'th' });
        expect(typeof result.reply).toBe('string');
        expect(typeof result.cssCommand).toBe('string');
        expect(result).toHaveProperty('action');
        expect(result).toHaveProperty('interactive');
    });

    test('keeps an explicit site profile isolated from demonstration knowledge', () => {
        const profile = resolveSiteProfile('INDICATOR_ISOLATED_DEMO');
        const result = runIndicatorAgent({
            prompt: 'หาแพ็กเกจ Pro Matrix ให้หน่อย',
            url: 'https://books.example/',
            locale: 'th',
            siteProfile: profile
        });
        expect(result.action).toMatchObject({ type: 'warp', searchAll: true });
        expect(result.reply).toContain('ทั่วเว็บไซต์');
        expect(result.agent).toMatchObject({ name: 'Orbit Books Assistant', role: 'ผู้ช่วยร้านหนังสือ' });
    });

    test('allows a profile only on its registered browser origin', () => {
        const profile = resolveSiteProfile('INDICATOR_ISOLATED_DEMO');
        expect(originIsAllowed(profile, 'https://books.example')).toBe(true);
        expect(originIsAllowed(profile, 'https://attacker.example')).toBe(false);
        expect(profile).not.toHaveProperty('siteKey');
    });

    test('infers a safe role when a site is not onboarded yet', () => {
        const identity = inferSiteIdentity({
            title: 'ร้านต้นไม้สีเขียว',
            siteDNA: { entities: ['ต้นมอนสเตอร่า'] }
        });
        expect(identity.role).toContain('ฝ่ายขาย');
        expect(identity.name).toContain('ร้านต้นไม้สีเขียว');
    });

    test('the rebuilt widget recognizes safe cross-page navigation', () => {
        const bundle = fs.readFileSync(path.resolve(__dirname, '../../supreme-boost/boost.js'), 'utf8');
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        expect(bundle).toContain('case"navigate"');
        expect(source).toContain('safeNavigationUrl');
        expect(source).toContain('sourceSummary');
        expect(source).not.toContain('case "inject_html"');
        expect(source).not.toContain('case "plugin_action"');
        expect(source).toContain("credentials: 'omit'");
        expect(source).toContain('new URL(rawUrl, location.href)');
        expect(source).toContain('destination.origin !== location.origin');
    });

    test('the pricing page inline script compiles', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../../pricing.html'), 'utf8');
        const inlineScript = html.match(/<script>\s*([\s\S]*?)<\/script>/i);
        expect(inlineScript).not.toBeNull();
        expect(() => new vm.Script(inlineScript[1])).not.toThrow();
    });
});
