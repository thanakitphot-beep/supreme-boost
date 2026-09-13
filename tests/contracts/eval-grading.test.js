const { grade } = require('../../evals/run-thai-assistant');
test('number formatting and English capitalization do not change factual score', () => {
    expect(grade({ checks: ['1840'], any: ['baht'] }, { reply: '1,840 Baht' })).toEqual([]);
    expect(grade({ checks: ['1840'] }, { reply: '18,400 baht' })).toContain('missing:1840');
});
test('resolved navigation must still identify the requested target', () => {
    expect(grade({ actionTypes: ['warp', 'navigate'], target: 'Alpha' }, { reply: 'ready', action: { type: 'warp', targetText: 'Beta' } })).toContain('wrong_target');
});
