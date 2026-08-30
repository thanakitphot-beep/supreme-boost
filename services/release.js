'use strict';

const packageInfo = require('../package.json');

function releaseInfo(env = process.env) {
    const commit = String(env.RENDER_GIT_COMMIT || env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT || 'unknown').trim();
    return {
        version: packageInfo.version,
        commit: commit === 'unknown' ? commit : commit.slice(0, 40)
    };
}

module.exports = { releaseInfo };
