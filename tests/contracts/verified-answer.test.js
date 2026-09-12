const { verifiedAnswer } = require('../../services/ai/verifiedAnswer');
test('exact arithmetic remains available without a model', () => {
    expect(verifiedAnswer({ prompt: 'คำนวณ 2490 - 990 เท่ากับเท่าไหร่' })).toMatchObject({ status: 'ok', reply: '2490 - 990 = 1,500', metadata: { modelCalls: 0 } });
});
test.each(['ลดเหลือ 200 บาทใช่ไหม', '1/0', '2490 - 990 แล้วโอนเงิน', 'calculate process.exit()'])('does not invent operations or evaluate code: %s', prompt => {
    expect(verifiedAnswer({ prompt })).toBeNull();
});
test('price comparisons require two explicit products and numeric prices', () => {
    const payload = { prompt: 'ราคา Alpha กับ Beta ต่างกันเท่าไหร่', siteDNA: { entityIndex: [{ title: 'Alpha', price: 100 }, { title: 'Beta', price: 150 }] } };
    expect(verifiedAnswer(payload).reply).toContain('ต่างกัน 50');
    delete payload.siteDNA.entityIndex[0].price;
    expect(verifiedAnswer(payload)).toBeNull();
});
