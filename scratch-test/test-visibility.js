const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    const fileUrl = 'file:///C:/Users/WAyu/Downloads/webtestv1/index.html';
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });
    
    const visibility = await page.evaluate(() => {
        // Element at the exact center of the orb (1204 + 26 = 1230, 724 + 26 = 750)
        const el = document.elementFromPoint(1230, 750);
        return el ? el.tagName + '#' + el.id + '.' + el.className : 'null';
    });
    console.log('Element at orb position:', visibility);

    await browser.close();
})();
