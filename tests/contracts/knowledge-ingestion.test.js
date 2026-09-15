jest.mock('../../services/ssrfBlocker', () => ({ isSafeFetchUrl: jest.fn() }));
jest.mock('../../api/_db', () => ({ upsertKnowledge: jest.fn(), retireKnowledgeAfterIndex: jest.fn(), getKnowledgeById: jest.fn(), deleteKnowledge: jest.fn(), getKnowledge: jest.fn() }));
jest.mock('../../api/_auth', () => ({ verifyToken: jest.fn(() => true), verifyJWT: jest.fn(() => ({ tenantId: 'shop-a', role: 'tenant' })) }));
const db = require('../../api/_db');
const { isSafeFetchUrl } = require('../../services/ssrfBlocker');
const { splitKnowledge, cleanSource, publicUrl, fetchPublicPage, extractPage, storeSource } = require('../../services/knowledgeIngestion');
const handler = require('../../api/knowledge');
const response = () => ({ setHeader() {}, status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), end() {} });
const req = (body, url = '/api/knowledge/text', method = 'POST') => ({ method, url, headers: { authorization: 'Bearer test' }, body });
describe('safe owner knowledge ingestion without embedding credits', () => {
    let previousFetch;
    beforeEach(() => { jest.clearAllMocks(); previousFetch = global.fetch; global.fetch = jest.fn(); db.upsertKnowledge.mockResolvedValue({ id: 'saved' }); db.retireKnowledgeAfterIndex.mockResolvedValue(true); });
    afterEach(() => { global.fetch = previousFetch; });
    test('splits unspaced Thai, keeps the tail, and bounds each chunk', () => {
        const parts = splitKnowledge('ทดสอบภาษาไทย'.repeat(500) + 'สุดท้าย');
        expect(parts.length).toBeGreaterThan(1);
        expect(parts.every(part => part.length <= 900)).toBe(true);
        expect(parts.at(-1)).toContain('สุดท้าย');
    });
    test('preserves paragraph text while masking common sensitive strings', () => {
        expect(cleanSource('ราคา 990 บาท\nhelp@example.com\nBearer abcdefghijklmnop')).toBe('ราคา 990 บาท\n[REDACTED_EMAIL]\n[REDACTED_SECRET]');
    });
    test.each(['https://shop.example/admin-dashboard.html', 'https://shop.example/account', 'https://shop.example/page?token=secret', 'https://shop.example.evil.test/'])('rejects private/query/foreign source: %s', url => {
        expect(publicUrl(url, 'https://shop.example')).toBeNull();
    });
    test('rejects an unsafe DNS destination before fetching', async () => {
        isSafeFetchUrl.mockResolvedValue(false);
        await expect(fetchPublicPage('https://shop.example/', 'https://shop.example', Date.now() + 1000)).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
    });
    test('does not follow a redirect to private or external origin', async () => {
        isSafeFetchUrl.mockResolvedValue(true);
        fetch.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secrets' } }));
        await expect(fetchPublicPage('https://shop.example/', 'https://shop.example', Date.now() + 1000)).rejects.toThrow('Redirect');
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    test('removes form and hidden text and excludes foreign discovered links', () => {
        const result = extractPage('<main><h2>นโยบาย</h2><p>จัดส่ง 3 วัน</p><form>private form</form><p hidden>hidden secret</p><a href="/delivery">ส่ง</a><a href="https://shop.example.evil/">bad</a></main>', 'https://shop.example/');
        expect(result.content).toContain('จัดส่ง 3 วัน');
        expect(result.content).not.toMatch(/private form|hidden secret/);
        expect(result.links).toEqual(['https://shop.example/delivery']);
    });
    test('stores original text with no model calls or key required', async () => {
        const res = response();
        await handler(req({ tenantId: 'shop-a', title: 'Policy', text: 'คืนสินค้าได้ภายใน 7 วัน' }), res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(db.upsertKnowledge).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'shop-a', embedding: null, content: 'คืนสินค้าได้ภายใน 7 วัน', sourceType: 'tenant_text' }));
        expect(fetch).not.toHaveBeenCalled();
    });
    test('does not retire previous chunks when a write fails', async () => {
        db.upsertKnowledge.mockResolvedValueOnce({ id: 'first' }).mockResolvedValueOnce(null);
        await expect(storeSource(db, { tenantId: 'shop-a', url: 'text:policy', content: 'ข้อความยาว '.repeat(200) })).rejects.toThrow();
        expect(db.retireKnowledgeAfterIndex).not.toHaveBeenCalled();
    });
    test('reports failure instead of zero-chunk success when persistence fails', async () => {
        db.upsertKnowledge.mockResolvedValue(null);
        const res = response();
        await handler(req({ tenantId: 'shop-a', text: 'ข้อมูลใหม่' }), res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
    test('rejects another tenant before writing', async () => {
        const res = response(); await handler(req({ tenantId: 'shop-b', text: 'ข้อมูล' }), res);
        expect(res.status).toHaveBeenCalledWith(403); expect(db.upsertKnowledge).not.toHaveBeenCalled();
    });
    test('cannot delete another tenant record by guessing its id', async () => {
        db.getKnowledgeById.mockResolvedValue({ id: 'other', tenant_id: 'shop-b' });
        const res = response(); await handler(req({ id: 'other' }, '/api/knowledge', 'DELETE'), res);
        expect(res.status).toHaveBeenCalledWith(404); expect(db.deleteKnowledge).not.toHaveBeenCalled();
    });
    test('deletes an owned record with tenant scope enforced in storage', async () => {
        db.getKnowledgeById.mockResolvedValue({ id: 'own', tenant_id: 'shop-a' }); db.deleteKnowledge.mockResolvedValue(true);
        const res = response(); await handler(req({ id: 'own' }, '/api/knowledge', 'DELETE'), res);
        expect(db.deleteKnowledge).toHaveBeenCalledWith('own', 'shop-a'); expect(res.status).toHaveBeenCalledWith(200);
    });
});
