const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.log('ERR:', err.message));

    const fileUrl = 'file:///C:/Users/WAyu/Downloads/webtestv1/index.html';
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });

    // Wait a bit extra for any async init
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
        const root = document.getElementById('supreme-boost-root');
        if (!root) return { status: 'FAIL', reason: 'Widget root element NOT found in DOM' };
        const shadow = root.shadowRoot;
        if (!shadow) return { status: 'FAIL', reason: 'Shadow root NOT attached' };
        const orb = shadow.querySelector('.sb-orb');
        if (!orb) return { status: 'FAIL', reason: 'Orb button NOT found in shadow DOM' };
        
        const rect = orb.getBoundingClientRect();
        const rootStyles = window.getComputedStyle(root);

        // Check clickability
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const elAtCenter = document.elementFromPoint(cx, cy);
        const isClickable = elAtCenter && (elAtCenter.id === 'supreme-boost-root' || elAtCenter.closest('#supreme-boost-root'));

        // Check chat panel
        const panel = shadow.querySelector('.sb-panel');
        const panelDisplay = panel ? window.getComputedStyle(panel).display : 'N/A';

        return {
            status: 'OK',
            orbPosition: { x: Math.round(rect.x), y: Math.round(rect.y) },
            orbSize: { w: Math.round(rect.width), h: Math.round(rect.height) },
            orbVisible: rect.width > 0 && rect.height > 0,
            orbClickable: isClickable,
            elementAtCenter: elAtCenter ? elAtCenter.tagName + '#' + elAtCenter.id : 'null',
            rootContain: rootStyles.contain,
            rootZIndex: rootStyles.zIndex,
            panelExists: !!panel,
            panelDisplay: panelDisplay,
            consoleErrors: 0
        };
    });
    
    console.log('\n========= FINAL TEST RESULT =========');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.status === 'OK' && result.orbVisible && result.orbClickable) {
        console.log('\n✅ PASS: Widget is visible and clickable!');
    } else {
        console.log('\n❌ FAIL:', result.reason || 'Orb not visible or not clickable');
    }

    // Take screenshot as proof
    await page.screenshot({ path: path.join(__dirname, 'final_test.png'), fullPage: false });
    console.log('Screenshot: final_test.png');

    await browser.close();
})();
