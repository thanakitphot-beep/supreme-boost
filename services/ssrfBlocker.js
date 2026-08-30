const dns = require('node:dns').promises;
const net = require('node:net');

const nonPublicAddresses = new net.BlockList();
[
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
    ['224.0.0.0', 4], ['240.0.0.0', 4]
].forEach(([address, prefix]) => nonPublicAddresses.addSubnet(address, prefix, 'ipv4'));
[
    ['::', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
    ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fec0::', 10], ['fe80::', 10], ['ff00::', 8]
].forEach(([address, prefix]) => nonPublicAddresses.addSubnet(address, prefix, 'ipv6'));

function normalizeHostname(hostname) {
    return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isPublicAddress(address) {
    const family = net.isIP(address);
    if (family === 4) return !nonPublicAddresses.check(address, 'ipv4');
    if (family === 6) return !String(address).toLowerCase().startsWith('::ffff:') && !nonPublicAddresses.check(address, 'ipv6');
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

module.exports = { isPublicAddress, isSafeFetchUrl, isSafeUrl };
