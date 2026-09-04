const { runIndicatorAgent } = require('../../services/indicatorAgent');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolveSiteProfile, originIsAllowed, inferSiteIdentity } = require('../../services/siteProfiles');

describe('INDICATOR owned agent — contract', () => {
    test('finds the actual MegaStore running shoe', () => {
        const result = runIndicatorAgent({
            prompt: 'ช่วยหารองเท้าวิ่ง Nike ให้หน่อย',
            url: 'http://localhost:3000/megastore.html',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        expect(result.status).toBe('ok');
        expect(result.reply).toContain('รองเท้าวิ่ง Nike Air');
        expect(result.action).toMatchObject({ type: 'warp', targetText: 'รองเท้าวิ่ง Nike Air', confirmationRequired: true });
        expect(result.interactive).toMatchObject({ type: 'destination_choices', persist: true });
        expect(result.cssCommand).toBe('');
    });

    test('understands a natural brand request without requiring the word product', () => {
        const result = runIndicatorAgent({
            prompt: 'อยากได้ nike',
            url: 'http://localhost:3000/megastore.html',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        expect(result.reply).toContain('รองเท้าวิ่ง Nike Air');
        expect(result.action).toMatchObject({ type: 'warp' });
    });

    test('checks the site before answering an availability question outside known product categories', () => {
        const result = runIndicatorAgent({
            prompt: 'ร้านนี้มีต้นไม้ไหม',
            url: 'http://localhost:3000/megastore.html',
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
            url: 'http://localhost:3000/megastore.html',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        expect(result.reply).toContain('รายการที่น่าสนใจ');
        expect(result.action).toBeNull();
        expect(result.interactive).toMatchObject({ type: 'destination_choices', persist: true });
        expect(result.interactive.items.length).toBeGreaterThan(0);
        expect(result.interactive.items[0].action).toMatchObject({ confirmationRequired: true });
    });

    test('searches the current catalog before crawling when a Thai product request is imprecise', () => {
        const result = runIndicatorAgent({
            prompt: 'อยากได้แบบกางเกง 3 ส่วน',
            url: 'http://localhost:3000/megastore.html',
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
            url: 'http://localhost:3000/megastore.html',
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
            url: 'http://localhost:3000/megastore.html',
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
        expect(result.action).toMatchObject({ type: 'navigate', url: '/pricing.html', confirmationRequired: true });
        expect(result.interactive.type).toBe('destination_choices');
    });

    test('returns ranked alternatives instead of choosing an ambiguous page', () => {
        const result = runIndicatorAgent({
            prompt: 'ช่วยหาหน้าบริการ',
            url: 'https://example.com/',
            locale: 'th',
            siteProfile: {
                id: 'ambiguous-pages',
                permissions: ['navigate_same_origin'],
                knowledge: {
                    pages: [
                        { id: 'personal', title: 'บริการสำหรับบุคคล', url: '/personal', headings: ['บริการและสิทธิประโยชน์'], keywords: ['บริการ'] },
                        { id: 'business', title: 'บริการสำหรับองค์กร', url: '/business', headings: ['บริการและโซลูชันธุรกิจ'], keywords: ['บริการ'] }
                    ],
                    catalog: [],
                    glossary: []
                }
            }
        });

        expect(result.action).toBeNull();
        expect(result.interactive).toMatchObject({ type: 'destination_choices', confidence: 'ambiguous', compare: true, persist: true });
        expect(result.interactive.items.map(item => item.title)).toEqual(['บริการสำหรับบุคคล', 'บริการสำหรับองค์กร']);
        expect(result.interactive.items.every(item => item.action.confirmationRequired)).toBe(true);
    });

    test('finds a published page despite a natural Thai typo', () => {
        const result = runIndicatorAgent({
            prompt: 'พาไปหน้าราคคา',
            url: 'https://example.com/',
            locale: 'th',
            siteProfile: {
                id: 'typo-page',
                permissions: ['navigate_same_origin'],
                knowledge: {
                    pages: [{ id: 'pricing', title: 'ราคาและแพ็กเกจ', url: '/pricing', headings: ['ราคาแพ็กเกจ'], keywords: ['ราคา'] }],
                    catalog: [],
                    glossary: []
                }
            }
        });

        expect(result.reply).toContain('ราคาและแพ็กเกจ');
        expect(result.action).toMatchObject({ type: 'navigate', url: '/pricing', confirmationRequired: true });
        expect(result.interactive.items[0].title).toBe('ราคาและแพ็กเกจ');
    });

    test('resolves a customer scenario against published product attributes', () => {
        const result = runIndicatorAgent({
            prompt: 'ต้องใช้ตอนเดินเยอะเพราะปวดเท้า',
            url: 'https://shop.example/',
            locale: 'th',
            siteProfile: {
                id: 'scenario-products',
                permissions: ['navigate_same_origin'],
                knowledge: {
                    pages: [],
                    catalog: [
                        { id: 'comfort', name: 'Comfort Walk', description: 'รองเท้านุ่ม รองรับแรงกระแทก', url: '/comfort', keywords: ['นุ่ม', 'ซัพพอร์ต'] },
                        { id: 'formal', name: 'Oxford Classic', description: 'รองเท้าหนังทางการ', url: '/formal', keywords: ['ทำงาน'] }
                    ],
                    glossary: []
                }
            }
        });

        expect(result.reply).toContain('Comfort Walk');
        expect(result.action).toMatchObject({ type: 'navigate', url: '/comfort', confirmationRequired: true });
        expect(result.interactive.items.map(item => item.title)).toEqual(['Comfort Walk']);
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

    test('uses the last assistant reply to answer a follow-up product question', () => {
        const first = runIndicatorAgent({
            prompt: 'ช่วยหารองเท้าวิ่ง Nike ให้หน่อย',
            url: 'http://localhost:3000/megastore.html',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST')
        });
        const followUp = runIndicatorAgent({
            prompt: 'มันคือรองเท้าอะไร',
            url: 'http://localhost:3000/megastore.html',
            locale: 'th',
            siteProfile: resolveSiteProfile('INDICATOR_TEST'),
            history: [
                { role: 'user', text: 'ช่วยหารองเท้าวิ่ง Nike ให้หน่อย' },
                { role: 'assistant', text: first.reply }
            ]
        });
        expect(followUp.reply).toContain('รองเท้าวิ่ง Nike Air คือ');
        expect(followUp.reply).toContain('Air Max Cushioning');
        expect(followUp.sources[0]).toMatchObject({ type: 'conversation_catalog', id: 'nike-air' });
    });

    test('keeps product-detail follow-ups grounded and requests optional research', () => {
        const profile = resolveSiteProfile('INDICATOR_TEST');
        const first = runIndicatorAgent({
            prompt: 'ช่วยหารองเท้าวิ่ง Nike ให้หน่อย', url: 'http://localhost:3000/megastore.html', locale: 'th', siteProfile: profile
        });
        const result = runIndicatorAgent({
            prompt: 'นุ่มแค่ไหน', url: 'http://localhost:3000/megastore.html', locale: 'th', siteProfile: profile,
            history: [{ role: 'assistant', text: first.reply }]
        });
        expect(result.reply).toContain('ยังไม่มีข้อมูลยืนยัน');
        expect(result.reply).toContain('Air Max Cushioning');
        expect(result.researchRequest).toMatchObject({ subject: 'รองเท้าวิ่ง Nike Air', question: 'นุ่มแค่ไหน' });
    });

    test('uses cited external research only when the server supplies it', () => {
        const profile = resolveSiteProfile('INDICATOR_TEST');
        const result = runIndicatorAgent({
            prompt: 'นุ่มแค่ไหน', url: 'http://localhost:3000/megastore.html', locale: 'th', siteProfile: profile,
            history: [{ role: 'assistant', text: 'เจอ รองเท้าวิ่ง Nike Air ราคา 2,790 บาท ครับ' }],
            externalResearch: { results: [{ title: 'Independent review', snippet: 'Reviewer notes a soft, cushioned ride.', url: 'https://reviews.example/nike-air' }] }
        });
        expect(result.reply).toContain('Independent review');
        expect(result.sources[0]).toMatchObject({ type: 'external_research', url: 'https://reviews.example/nike-air' });
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

    test('warps to the exact Thai phrase requested on the current page', () => {
        const result = runIndicatorAgent({
            prompt: '🌍 ต่างประเทศ อยู่ไหน',
            url: 'https://news.example/articles/ai-001',
            locale: 'th',
            siteProfile: { permissions: ['navigate_same_origin'] },
            pageContent: 'ข่าว AI วันนี้ มีหัวข้อท่องเที่ยวและข้อความ 🌍 ต่างประเทศ อยู่ไหน สำหรับผู้อ่าน',
            siteDNA: {
                headings: ['ข่าว AI และปัญญาประดิษฐ์'],
                activeSectionText: 'บทความเกี่ยวกับ AI Agent รุ่นใหม่'
            }
        });

        expect(result.reply).toContain('ต่างประเทศ');
        expect(result.action).toMatchObject({
            type: 'warp',
            targetText: 'ต่างประเทศ',
            keywords: ['ต่างประเทศ'],
            exactText: 'ต่างประเทศ'
        });
        expect(result.sources[0]).toEqual({ type: 'live_page', query: 'ต่างประเทศ' });
    });

    test('uses the indexed article selector when it contains the requested phrase', () => {
        const result = runIndicatorAgent({
            prompt: 'ต่างประเทศ อยู่ตรงไหน',
            url: 'https://news.example/articles',
            locale: 'th',
            siteProfile: { permissions: ['navigate_same_origin'] },
            siteDNA: {
                entityIndex: [{
                    id: 'news-foreign',
                    title: 'ข่าวเศรษฐกิจต่างประเทศ',
                    description: 'สรุปข่าวจากต่างประเทศประจำวัน',
                    selector: '[data-sb-entity-id="news-foreign"]',
                    href: 'https://news.example/articles'
                }]
            }
        });

        expect(result.action).toMatchObject({
            type: 'warp',
            entityId: 'news-foreign',
            selector: '[data-sb-entity-id="news-foreign"]',
            targetText: 'ต่างประเทศ',
            exactText: 'ต่างประเทศ'
        });
        expect(result.sources[0]).toEqual({ type: 'structured_entity', query: 'ต่างประเทศ' });
    });

    test('prefers an exact section heading over an article that only mentions it', () => {
        const result = runIndicatorAgent({
            prompt: 'หัวข้อ เทคโนโลยี อยู่ไหน',
            url: 'https://news.example/articles/long-001',
            locale: 'th',
            siteProfile: { permissions: ['navigate_same_origin'] },
            siteDNA: {
                headings: ['h1:บทความยาวสำหรับทดสอบ Agent', 'h2:จุดเริ่มต้นของการเปลี่ยนแปลง', 'h2:💻 เทคโนโลยี'],
                entityIndex: [{
                    id: 'long-001',
                    title: 'จาก Chatbot สู่ AI Agent: การเปลี่ยนแปลงที่อาจส่งผลต่อธุรกิจ เทคโนโลยี และตลาดแรงงาน',
                    description: 'บทความทดสอบ',
                    selector: '[data-sb-entity-id="long-001"]',
                    href: 'https://news.example/articles/long-001'
                }]
            }
        });

        expect(result.reply).toContain('หัวข้อ “เทคโนโลยี”');
        expect(result.action).toMatchObject({
            type: 'warp',
            targetText: 'เทคโนโลยี',
            exactHeading: 'เทคโนโลยี',
            exactText: 'เทคโนโลยี'
        });
        expect(result.action).not.toHaveProperty('entityId');
        expect(result.sources[0]).toEqual({ type: 'heading', query: 'เทคโนโลยี' });
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
            prompt: 'หารองเท้าวิ่ง Nike ให้หน่อย',
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
        expect(bundle).toContain('sb-destination-choices');
        expect(source).toContain('safeNavigationUrl');
        expect(source).toContain('highlightExactPhrase');
        expect(source).toContain('highlightExactHeading');
        expect(source).toContain('act.exactHeading');
        expect(source).toContain('act.exactText');
        expect(source).toContain("credentials: 'omit'");
        expect(source).toContain('new URL(rawUrl, location.href)');
        expect(source).toContain('destination.origin !== location.origin');
        expect(source).toContain('sb-destination-choices');
        expect(source).toContain('ยืนยันและวาร์ป');
        expect(source).toContain('userConfirmed: true');
        expect(source).not.toContain('autoWarpCheck(data.reply)');
        expect(source).not.toContain('if (r[0].score > 0) { navigate');
    });

    test('the pricing page inline script compiles', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../../pricing.html'), 'utf8');
        const inlineScript = html.match(/<script>\s*([\s\S]*?)<\/script>/i);
        expect(inlineScript).not.toBeNull();
        expect(() => new vm.Script(inlineScript[1])).not.toThrow();
    });
});
