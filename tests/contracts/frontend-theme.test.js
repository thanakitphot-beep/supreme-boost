const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

    test.each(pages)('%s inline scripts compile', page => {
        const html = fs.readFileSync(path.resolve(__dirname, '../..', page), 'utf8');
        const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>\s*([\s\S]*?)<\/script>/giu)]
            .filter(match => !/\bsrc\s*=/iu.test(match[0]))
            .map(match => match[1]);
        scripts.forEach(script => expect(() => new vm.Script(script)).not.toThrow());
    });

    test('landing page uses outcome-focused language', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
        expect(html).not.toContain('God-Tier');
        expect(html).not.toContain('Edge Breathing Glow');
        expect(html).not.toContain('gemini-2.0-flash');
        expect(html).toContain('ศูนย์จัดการ SaaS');
        expect(html).toContain('if (data.activated)');
        expect(html).toContain("fetch('/api/tenant?action=profile')");
        expect(html).toContain('Activated profile refresh failed');
    });

    test('widget uses the restrained product style layer', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        expect(source).toContain('applyWidgetSymbolStyle');
        expect(source).toContain('Website assistant ready');
        expect(source).toContain('/api/handoff');
        expect(source).toContain('data.status !== "ok"');
        expect(source).toContain('siteKey: cfg.siteKey');
        expect(source).toContain('escHtml(cfg.title)');
        expect(source).toContain('new URL("/INDICATOR.png", script.src).href');
    });

    test('admin control center inline scripts compile', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../../admin-dashboard.html'), 'utf8');
        const login = fs.readFileSync(path.resolve(__dirname, '../../admin-login.html'), 'utf8');
        expect(html).not.toContain('admin_token');
        expect(html).not.toContain('AUTH_TOKEN');
        expect(login).not.toContain('admin_token');
        expect(html).not.toContain('openCustomerDashboard');
        expect(html).not.toContain('gemini-2.0-flash');
        const scripts = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/gi)].map(match => match[1]);
        expect(scripts.length).toBeGreaterThan(0);
        scripts.forEach(script => expect(() => new vm.Script(script)).not.toThrow());
    });
});
