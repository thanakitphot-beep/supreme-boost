const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    // Using forward slashes for Windows file URI
    const fileUrl = 'file:///C:/Users/WAyu/Downloads/webtestv1/index.html';
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });
    
    const orbBounds = await page.evaluate(() => {
        const root = document.getElementById('supreme-boost-root');
        if (!root) return 'No root found';
        const shadow = root.shadowRoot;
        if (!shadow) return 'No shadow root';
        const orb = shadow.querySelector('.sb-orb');
        if (!orb) return 'No orb';
        const rect = orb.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right };
    });
    console.log('User HTML Orb Bounds:', orbBounds);

    await browser.close();
})();
