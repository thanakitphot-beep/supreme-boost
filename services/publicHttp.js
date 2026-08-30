'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const { isPublicAddress, isSafeUrl } = require('./ssrfBlocker');

function createPublicLookup(resolve = dns.lookup) {
    return function publicLookup(hostname, options, callback) {
        const lookupOptions = typeof options === 'object' ? options : { family: options };
        Promise.resolve(resolve(hostname, {
            all: true,
            verbatim: true,
            family: lookupOptions.family || 0
        })).then(records => {
            if (!Array.isArray(records) || !records.length || records.some(record => !isPublicAddress(record.address))) {
                throw new Error('DNS resolved to a non-public address');
            }
            if (lookupOptions.all) callback(null, records);
            else callback(null, records[0].address, records[0].family);
        }).catch(error => callback(error));
    };
}

function fetchPublicResource(urlValue, options = {}) {
    return new Promise((resolve, reject) => {
        const urlString = String(urlValue || '');
        if (!isSafeUrl(urlString)) return reject(new Error('Unsafe public URL'));

        const url = new URL(urlString);
        const transport = url.protocol === 'https:' ? https : http;
        const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 5000, 1000), 15000);
        const maxBytes = Math.min(Math.max(Number(options.maxBytes) || 500_000, 1024), 2_000_000);
        let settled = false;
        let deadline = null;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            if (deadline) clearTimeout(deadline);
            if (error) reject(error);
            else resolve(value);
        };

        const request = transport.request(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5',
                'User-Agent': 'INDICATOR-PublicCrawler/1.0',
                ...(options.headers || {})
            },
            lookup: createPublicLookup()
        }, response => {
            const declaredLength = Number(response.headers['content-length'] || 0);
            if (declaredLength > maxBytes) {
                response.destroy();
                return finish(new Error('Public response exceeds the size limit'));
            }

            const chunks = [];
            let bytes = 0;
            response.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > maxBytes) {
                    response.destroy();
                    finish(new Error('Public response exceeds the size limit'));
                    return;
                }
                chunks.push(Buffer.from(chunk));
            });
            response.on('error', error => finish(error));
            response.on('end', () => finish(null, {
                status: Number(response.statusCode || 0),
                ok: Number(response.statusCode || 0) >= 200 && Number(response.statusCode || 0) < 300,
                headers: response.headers,
                body: Buffer.concat(chunks, bytes)
            }));
        });

        deadline = setTimeout(() => request.destroy(new Error('Public request timed out')), timeoutMs);
        if (typeof deadline.unref === 'function') deadline.unref();
        request.on('error', error => finish(error));
        request.end();
    });
}

module.exports = { createPublicLookup, fetchPublicResource };
