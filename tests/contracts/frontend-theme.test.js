const fs = require('fs');
const path = require('path');

describe('Shared product visual system', () => {
    const pages = [
        'index.html',
        'pricing.html',
        'customer-login.html',
        'admin-login.html',
        'customer-dashboard.html',
        'admin-dashboard.html'
    ];

    test.each(pages)('%s loads the shared UI foundation', page => {
        const html = fs.readFileSync(path.resolve(__dirname, '../..', page), 'utf8');
        expect(html).toContain('/styles/indicator-ui.css');
    });

    test('landing page uses outcome-focused language', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
        expect(html).not.toContain('God-Tier');
        expect(html).not.toContain('Edge Breathing Glow');
        expect(html).toContain('ศูนย์จัดการ SaaS');
    });

    test('widget uses the restrained product style layer', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        expect(source).toContain('applyProductStyles');
        expect(source).toContain('Website assistant ready');
    });
});
