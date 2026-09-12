const { entityContext } = require('../../services/ai/entityContext');
const { buildContext } = require('../../services/ai/contextBuilder');

test('visible prices survive exhausted RAG and page budgets', () => {
    const context = buildContext({ userMessage: 'เปรียบเทียบกระเป๋าสองใบ', ragContext: 'x'.repeat(12000), pageContent: 'y'.repeat(12000), siteDNA: { entityIndex: [
        { title: 'กระเป๋าเมฆ', price: 650, description: '300 กรัม' },
        { title: 'กระเป๋าดาว', price: 950, description: '500 กรัม' }
    ] } });
    expect(context.messages.at(-1).content).toContain('"price":650');
    expect(context.messages.at(-1).content).toContain('"price":950');
});

test('mentioned product beyond the first twenty is retained', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ title: `สินค้า[${i}]`, price: i }));
    expect(entityContext({ entityIndex: items }, 'ขอราคา สินค้า[99]')[0].price).toBe(99);
    expect(entityContext({ entityIndex: items })).toHaveLength(20);
});

test('unknown stock is omitted, zero price and false stock remain facts', () => {
    expect(entityContext({ entityIndex: [{ title: 'free', price: 0, inStock: false }, { title: 'unknown', price: null }] })).toEqual([
        { title: 'free', description: '', price: 0, inStock: false }, { title: 'unknown', description: '' }
    ]);
});

test('only public allowlisted fields are included without mutating source', () => {
    const data = { entityIndex: [null, { title: '__indicator_context_product__:hidden' }, { title: 'visible', token: 'PRIVATE', html: 'PRIVATE', description: 'x'.repeat(10000) }] };
    const original = JSON.stringify(data);
    const output = JSON.stringify(entityContext(data));
    expect(output).not.toMatch(/PRIVATE|hidden/);
    expect(output.length).toBeLessThan(6000);
    expect(JSON.stringify(data)).toBe(original);
});
