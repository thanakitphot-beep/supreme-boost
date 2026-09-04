const { scorePageForQuery } = require('../../api/crawl');

describe('Site-wide crawl ranking', () => {
    const pricingPage = {
        url: 'https://example.com/pricing',
        html: '<title>ราคาและแพ็กเกจสำหรับองค์กร</title><h1>เลือกแผนที่เหมาะกับธุรกิจ</h1><p>รายละเอียดบริการ</p>',
        text: 'ราคาและแพ็กเกจสำหรับองค์กร เลือกแผนที่เหมาะกับธุรกิจ รายละเอียดบริการ'
    };

    test('ranks a published heading despite a one-character Thai typo', () => {
        const result = scorePageForQuery({ ...pricingPage, keywords: ['ราคคา'] });

        expect(result).toMatchObject({
            url: pricingPage.url,
            title: 'ราคาและแพ็กเกจสำหรับองค์กร',
            confidence: 'high'
        });
        expect(result.score).toBeGreaterThan(0);
    });

    test('does not turn an unrelated fuzzy phrase into a destination', () => {
        expect(scorePageForQuery({ ...pricingPage, keywords: ['ติดต่อ'] })).toBeNull();
    });

    test('weights title and heading matches above incidental body matches', () => {
        const titleMatch = scorePageForQuery({ ...pricingPage, keywords: ['ราคา'] });
        const bodyMatch = scorePageForQuery({
            url: 'https://example.com/about',
            html: '<title>เกี่ยวกับเรา</title><p>อ่านรายละเอียดราคาได้จากหน้าอื่น</p>',
            text: 'เกี่ยวกับเรา อ่านรายละเอียดราคาได้จากหน้าอื่น',
            keywords: ['ราคา']
        });

        expect(titleMatch.score).toBeGreaterThan(bodyMatch.score);
    });
});
