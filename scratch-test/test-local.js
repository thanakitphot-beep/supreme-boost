const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.log('ERR:', err.message));

    // Navigate to a blank page first
    await page.goto('about:blank');
    
    // Set basic HTML body
    await page.evaluate(() => {
        document.body.innerHTML = '<h1>NexaMart Test</h1><p>Test content here</p>';
    });
    
    // Inject the local boost.js with data attributes
    const boostPath = path.resolve(__dirname, '..', 'supreme-boost', 'boost.js');
    await page.addScriptTag({ 
        path: boostPath,
        id: 'boost-script'
    });
    
    // Set data attributes after injection
    await page.evaluate(() => {
        const s = document.getElementById('boost-script');
        if (s) {
            s.setAttribute('data-api-key', 'KEY_TEST');
            s.setAttribute('data-theme', 'dark-matrix');
        }
    });

    // Wait for widget to initialize
    await new Promise(r => setTimeout(r, 2000));
    
    // Check widget
    const result = await page.evaluate(() => {
        const root = document.getElementById('supreme-boost-root');
        if (!root) return { exists: false };
        const shadow = root.shadowRoot;
        if (!shadow) return { exists: true, shadow: false };
        const orb = shadow.querySelector('.sb-orb');
        if (!orb) return { exists: true, shadow: true, orb: false };
        
        const rect = orb.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const rootStyles = window.getComputedStyle(root);
        
        // Check what element is at the orb position
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const elAtPos = document.elementFromPoint(cx, cy);
        
        return {
            exists: true,
            shadow: true,
            orb: true,
            orbRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            rootRect: { x: Math.round(rootRect.x), y: Math.round(rootRect.y), w: Math.round(rootRect.width), h: Math.round(rootRect.height) },
            rootContain: rootStyles.contain,
            rootOverflow: rootStyles.overflow,
            rootPosition: rootStyles.position,
            rootZIndex: rootStyles.zIndex,
            rootPointerEvents: rootStyles.pointerEvents,
            orbVisible: rect.width > 0 && rect.height > 0,
            elementAtOrbCenter: elAtPos ? (elAtPos.tagName + '#' + elAtPos.id + '.' + (elAtPos.className || '').toString().slice(0, 40)) : 'null'
        };
    });
    console.log('\n=== WIDGET STATUS ===');
    console.log(JSON.stringify(result, null, 2));

    // Take screenshot
    await page.screenshot({ path: path.join(__dirname, 'local_test.png') });
    console.log('\nScreenshot saved to local_test.png');

    await browser.close();
})();
