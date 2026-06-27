const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`file://${path.join(__dirname, '..', 'scratch_test.html')}`, { waitUntil: 'networkidle0' });
    
    const orbBounds = await page.evaluate(() => {
        const orb = document.getElementById('supreme-boost-root').shadowRoot.querySelector('.sb-orb');
        const rect = orb.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right };
    });
    console.log('Orb Bounds:', orbBounds);

    await browser.close();
})();
