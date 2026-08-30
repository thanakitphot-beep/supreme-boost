const { abstain, lexical } = require('../../evals/lib/baselines');
const { evaluateCase, safeAction } = require('../../evals/lib/metrics');

const testCase = {
    id: 'unit-1',
    input: {
        message: 'ราคา Sprint',
        url: 'https://shop.example/',
        catalog: [{ id: 'sprint', title: 'Sprint', price: '2,490 บาท' }]
    },
    expected: {
        disposition: 'answer',
        facts: [['2490', '2,490']],
        allowedSourceIds: ['sprint'],
        requiredSourceIds: ['sprint'],
        allowedActionTypes: ['none']
    }
};

describe('Offline evaluation harness', () => {
    test('keeps the abstain and lexical baselines independent and deterministic', () => {
        expect(abstain()).toEqual(abstain());
        expect(lexical(testCase)).toEqual(lexical(testCase));
        expect(lexical(testCase).sources[0].id).toBe('sprint');
    });

    test('scores facts, citations, disposition, and actions together', () => {
        const evaluation = evaluateCase(testCase, lexical(testCase));
        expect(evaluation.passed).toBe(true);
        expect(evaluation.sourcePrecision).toBe(1);
    });

    test('rejects cross-origin and unknown actions', () => {
        expect(safeAction({ type: 'navigate', url: '/pricing' }, 'https://shop.example/')).toBe(true);
        expect(safeAction({ type: 'navigate', url: 'https://evil.example/' }, 'https://shop.example/')).toBe(false);
        expect(safeAction({ type: 'inject_html' }, 'https://shop.example/')).toBe(false);
    });

    test('treats a bounded site search without evidence as safe deferral', () => {
        const deferredCase = {
            ...testCase,
            expected: {
                disposition: 'defer',
                facts: [],
                allowedSourceIds: [],
                requiredSourceIds: [],
                allowedActionTypes: ['none']
            }
        };
        const evaluation = evaluateCase(deferredCase, {
            reply: 'ยังไม่มีหลักฐานตรง กรุณาตรวจผลการค้นหาในเว็บไซต์',
            sources: [],
            action: { type: 'search_site', query: 'carbon neutral' }
        });
        expect(evaluation).toMatchObject({ passed: true, disposition: 'defer', actionType: 'search_site' });
    });
});
