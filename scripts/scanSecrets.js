'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
if (listed.status !== 0) process.exit(listed.status || 1);

const textExtensions = new Set(['.js', '.json', '.jsonl', '.md', '.html', '.css', '.yml', '.yaml', '.toml', '.sql', '.txt', '.example', '.cff', '.py', '.sh', '.ps1', '.xml']);
const patterns = [
    ['Stripe live secret', /\bsk_live_[A-Za-z0-9]{20,}\b/u],
    ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{20,}\b/u],
    ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/u],
    ['Groq API key', /\bgsk_[A-Za-z0-9]{32,}\b/u],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/u],
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
    ['Credentialed MongoDB URI', /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s/@]+@/u],
    ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/u],
    ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u]
];

const findings = [];
for (const file of listed.stdout.split('\0').filter(Boolean)) {
    const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const [name, pattern] of patterns) {
        if (pattern.test(content)) findings.push(`${file}: ${name}`);
    }
}

if (findings.length) {
    findings.forEach(finding => console.error(finding));
    process.exit(1);
}
console.log('No high-confidence secrets found in tracked or untracked files');
