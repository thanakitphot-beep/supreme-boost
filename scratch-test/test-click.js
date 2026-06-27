const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.log('ERR:', err.message));

    await page.goto('file:///C:/Users/WAyu/Downloads/webtestv1/index.html', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));

    // Click the orb
    const orbClicked = await page.evaluate(() => {
        const root = document.getElementById('supreme-boost-root');
        if (!root || !root.shadowRoot) return false;
        const orb = root.shadowRoot.querySelector('.sb-orb');
        if (!orb) return false;
        orb.click();
        return true;
    });
    console.log('Orb clicked:', orbClicked);

    // Wait for animation
    await new Promise(r => setTimeout(r, 500));

    // Check if panel opened
    const panelState = await page.evaluate(() => {
        const root = document.getElementById('supreme-boost-root');
        const shadow = root.shadowRoot;
        const panel = shadow.querySelector('.sb-panel');
        const panelStyle = window.getComputedStyle(panel);
        const msgs = shadow.querySelector('.sb-messages');
        const greeting = msgs ? msgs.textContent.trim().slice(0, 100) : 'N/A';
        const input = shadow.querySelector('.sb-input');
        
        return {
            panelDisplay: panelStyle.display,
            panelOpacity: panelStyle.opacity,
            hostHasOpenClass: root.classList.contains('sb-open'),
            greetingText: greeting,
            inputExists: !!input,
            inputPlaceholder: input ? input.placeholder : 'N/A'
        };
    });

    console.log('\n========= CLICK TEST RESULT =========');
    console.log(JSON.stringify(panelState, null, 2));

    if (panelState.panelDisplay === 'flex' && panelState.panelOpacity === '1') {
        console.log('\n✅ PASS: Chat panel OPENED successfully!');
    } else {
        console.log('\n❌ FAIL: Chat panel did NOT open');
    }

    await page.screenshot({ path: path.join(__dirname, 'click_test.png'), fullPage: false });
    console.log('Screenshot: click_test.png');

    await browser.close();
})();
