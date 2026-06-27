const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    const fileUrl = 'file:///C:/Users/WAyu/Downloads/webtestv1/index.html';
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });
    
    await page.screenshot({ path: path.join(__dirname, '..', 'user_screenshot.png') });

    await browser.close();
})();
