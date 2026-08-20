const dns = require('node:dns').promises;
const net = require('node:net');

function normalizeHostname(hostname) {
    return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isPrivateIPv4(address) {
    const octets = String(address).split('.').map(Number);
    if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
    const [first, second] = octets;
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 198 && (second === 18 || second === 19));
}

function isPrivateIPv6(address) {
    const normalized = String(address).toLowerCase();
    return normalized === '::' || normalized === '::1' || normalized.startsWith('::ffff:') ||
        normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}

function isPublicAddress(address) {
    const family = net.isIP(address);
    if (family === 4) return !isPrivateIPv4(address);
    if (family === 6) return !isPrivateIPv6(address);
    return false;
}

function isSafeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
        const url = new URL(urlStr);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
        if (url.port && url.port !== '80' && url.port !== '443') return false;

        const hostname = normalizeHostname(url.hostname);
        if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false;
        if (hostname === 'metadata.google.internal' || hostname.endsWith('.metadata.google.internal')) return false;
        if (net.isIP(hostname)) return isPublicAddress(hostname);
        return true;
    } catch (_) {
        return false;
    }
}

async function isSafeFetchUrl(urlStr) {
    if (!isSafeUrl(urlStr)) return false;
    const hostname = normalizeHostname(new URL(urlStr).hostname);
    if (net.isIP(hostname)) return true;
    try {
        const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
        return addresses.length > 0 && addresses.every(record => isPublicAddress(record.address));
    } catch (_) {
        return false;
    }
}

module.exports = { isSafeFetchUrl, isSafeUrl };
