'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.js'], { encoding: 'utf8' });
if (listed.status !== 0) {
    console.error(listed.stderr || 'Unable to list JavaScript files');
    process.exit(1);
}

const files = [...new Set(listed.stdout.split('\0').filter(Boolean))].filter(file => {
    try { return fs.statSync(file).isFile(); } catch (_) { return false; }
});
const failures = [];
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) failures.push({ file, error: result.stderr.trim() });
}

if (failures.length) {
    failures.forEach(failure => console.error(`${failure.file}: ${failure.error}`));
    process.exit(1);
}
console.log(`JavaScript syntax verified for ${files.length} tracked or untracked files`);
