'use strict';

const {
    learnFromPublicPage,
    recordCorrectionCandidate,
    getLearningStatus,
    __resetForTests
} = require('../../services/knowledgeLearning');

describe('evidence-first knowledge learning', () => {
    const profile = { id: 'unit-learning-ledger', permissions: ['search_public_content'] };

    beforeEach(() => __resetForTests());

    test('supersedes a changed fact on the same official public page', () => {
        const first = learnFromPublicPage(profile, {
            url: 'https://shop.example/products/sprint',
            siteDNA: { entities: ['รองเท้าวิ่ง Sprint (฿2,490)'] }
        });
        expect(first.verifiedFacts).toBe(1);

        const updated = learnFromPublicPage(profile, {
            url: 'https://shop.example/products/sprint',
            siteDNA: { entities: ['รองเท้าวิ่ง Sprint (฿2,590)'] }
        });
        expect(updated.verifiedFacts).toBe(1);
        expect(updated.supersededFacts).toBe(1);
        expect(updated.conflictedFacts).toBe(0);
    });

    test('flags contradictory public facts and never promotes a user correction automatically', () => {
        learnFromPublicPage(profile, {
            url: 'https://shop.example/products/sprint',
            siteDNA: { entities: ['รองเท้าวิ่ง Sprint (฿2,490)'] }
        });
        const conflict = learnFromPublicPage(profile, {
            url: 'https://shop.example/sale',
            siteDNA: { entities: ['รองเท้าวิ่ง Sprint (฿2,190)'] }
        });
        expect(conflict.conflictedFacts).toBe(2);
        expect(conflict.verifiedFacts).toBe(0);

        const reviewed = recordCorrectionCandidate(profile, {
            url: 'https://shop.example/sale',
            question: 'รองเท้าราคาเท่าไร',
            correction: 'ราคาที่ตอบไม่ถูก ต้องเป็น 2,000 บาท'
        });
        expect(reviewed.pendingReview).toBe(1);
        expect(getLearningStatus(profile).verifiedFacts).toBe(0);
    });
});
