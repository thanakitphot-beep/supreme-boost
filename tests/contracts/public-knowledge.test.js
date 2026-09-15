const { buildLibrary } = require('../../scripts/build-knowledge-library');
const { getPublicKnowledge } = require('../../services/publicKnowledge');
const { isPublicAsset } = require('../../services/publicAssets');
const origin = 'https://indicator-web-chat.onrender.com';
describe('bundled knowledge from published sections', () => {
    test('compiles real selected sections and excludes account/checkout source', () => {
        const library = buildLibrary();
        expect(library.chunks).toHaveLength(30);
        expect(library.sources).toHaveLength(2);
        expect(JSON.stringify(library)).not.toMatch(/auth-modal|checkout-modal|bank_account|otp/);
        expect(library.chunks.some(chunk => chunk.content.includes('990'))).toBe(true);
    });
    test('only supplies platform knowledge to the first-party public demo', () => {
        expect(getPublicKnowledge('shop-a', origin, origin, 'คลังความรู้')).toBe('');
        expect(getPublicKnowledge('demo', 'https://other.example', origin, 'คลังความรู้')).toBe('');
        expect(getPublicKnowledge('demo', origin, 'https://other.example', 'คลังความรู้')).toBe('');
        expect(getPublicKnowledge('demo', origin, origin, 'ปิดคอมแล้วความรู้หายไหม')).toContain('ฐานข้อมูล');
    });
    test('supports source references without publishing raw data files', () => {
        expect(getPublicKnowledge('demo', origin, origin, 'เพิ่มข้อความครั้งละได้เท่าไหร่')).toContain('60,000');
        expect(isPublicAsset('/knowledge-guide.html')).toBe(true);
        expect(isPublicAsset('/data/knowledge-library.json')).toBe(false);
    });
});
