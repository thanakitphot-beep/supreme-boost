'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const build = require('../build');

async function verify() {
    const expectedPath = path.resolve('supreme-boost/boost.js');
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'indicator-widget-'));
    const actualPath = path.join(tempDirectory, 'boost.js');
    try {
        await build(actualPath);
        if (!fs.existsSync(expectedPath) || !fs.readFileSync(expectedPath).equals(fs.readFileSync(actualPath))) {
            console.error('Generated widget is stale. Run npm run build and commit supreme-boost/boost.js.');
            process.exitCode = 1;
            return;
        }
        console.log('Generated widget matches the source');
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
}

verify().catch(error => {
    console.error(`Generated widget verification failed: ${error.message}`);
    process.exitCode = 1;
});
