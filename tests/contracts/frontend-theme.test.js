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

    test('landing page uses outcome-focused language', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
        expect(html).not.toContain('God-Tier');
        expect(html).not.toContain('Edge Breathing Glow');
        expect(html).toContain('ศูนย์จัดการ SaaS');
        expect(html).toContain('รองรับภาษาไทยและอังกฤษ');
        expect(html).not.toContain('ไทย อังกฤษ จีน และญี่ปุ่น');
    });

    test('widget uses the restrained product style layer', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        expect(source).toContain('applyWidgetSymbolStyle');
        expect(source).toContain('Website assistant ready');
        expect(source).toContain('/api/handoff');
        expect(source).toContain('data.status !== "ok"');
        expect(source).toContain('siteKey: cfg.siteKey');
    });

    test('widget does not expose or apply a page theme switch', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        expect(source).not.toContain('data-action="theme"');
        expect(source).not.toContain('supreme-boost-dark-page');
        expect(source).not.toContain('getPref("theme")');
    });

    test('widget defaults to the public API when embedded on another domain', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        expect(source).toContain('https://indicator-web-chat.onrender.com/api/chat');
        expect(source).toContain('getAttr(s, "data-backend-url", DEFAULT_BACKEND_URL)');
    });

    test('widget uses the glowing INDICATOR chat icon', () => {
        const source = fs.readFileSync(path.resolve(__dirname, '../../src/widget/main.js'), 'utf8');
        const icon = fs.readFileSync(path.resolve(__dirname, '../../indicator-chat-icon.svg'), 'utf8');
        expect(source).toContain('indicator-chat-icon.svg');
        expect(source).toContain('sb-orb-logo');
        expect(source).toContain('sbIndicatorGlow');
        expect(icon).toContain('INDICATOR');
        expect(icon).toContain('linearGradient');
    });

    test.each(['admin-login.html', 'admin-dashboard.html'])('%s inline scripts compile', page => {
        const html = fs.readFileSync(path.resolve(__dirname, '../..', page), 'utf8');
        const scripts = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/gi)].map(match => match[1]);
        expect(scripts.length).toBeGreaterThan(0);
        scripts.forEach(script => expect(() => new vm.Script(script)).not.toThrow());
    });

    test('admin dashboard uses one overview request and recovers expired sessions', () => {
        const dashboard = fs.readFileSync(path.resolve(__dirname, '../../admin-dashboard.html'), 'utf8');
        const login = fs.readFileSync(path.resolve(__dirname, '../../admin-login.html'), 'utf8');
        expect(dashboard).toContain("fetchAPI('overview')");
        expect(dashboard).toContain('res.status === 401');
        expect(dashboard).toContain("redirectToAdminLogin('session')");
        expect(dashboard).not.toContain("Promise.all([fetchAPI('stats')");
        expect(login).toContain("payload.role === 'admin'");
        expect(login).toContain('Number(payload.exp) * 1000 > Date.now()');
    });
});
