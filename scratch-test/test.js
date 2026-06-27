const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    await page.goto(`file://${path.join(__dirname, '..', 'scratch_test.html')}`, { waitUntil: 'networkidle0' });
    
    // Check if the orb exists
    const orbHtml = await page.evaluate(() => {
        const root = document.getElementById('supreme-boost-root');
        if (!root) return 'WIDGET_ID not found';
        const shadow = root.shadowRoot;
        if (!shadow) return 'Shadow root not found';
        const orb = shadow.querySelector('.sb-orb');
        if (!orb) return '.sb-orb not found';
        return 'Orb is present. Width: ' + orb.offsetWidth + ', Height: ' + orb.offsetHeight + ', Display: ' + window.getComputedStyle(orb).display;
    });
    console.log('Orb Check:', orbHtml);

    await page.screenshot({ path: path.join(__dirname, '..', 'screenshot.png') });
    await browser.close();
})();
