const { buildLargeCorpus } = require('../../evals/large-curriculum');
const { validateCorpus } = require('../../evals/prepare-agent-training');
const { intentFor } = require('../../services/indicatorAgent');
test('large synthetic data keeps storefront families and duplicate inputs isolated', () => {
    expect(validateCorpus(buildLargeCorpus())).toMatchObject({ examples: 14400, families: 1200, splits: { train: 11520, validation: 1440, holdout: 1440 } });
});
test.each(['อยากติดต่อเจ้าหน้าที่ของร้านตัวอย่าง ช่วยส่งต่อให้หน่อย', 'ขอคุยกับพนักงานครับ'])('staff requests do not confuse เจ้าหน้าที่ with หน้า: %s', prompt => {
    expect(intentFor(prompt)).toBe('handoff');
});
test('explicit contact-page navigation remains navigation', () => {
    expect(intentFor('เปิดหน้าติดต่อให้หน่อย')).toBe('search_unified');
});
