'use strict';

const SIGNATURES = {
    'image/png': buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'image/jpeg': buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    'image/webp': buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
};

function parseImageDataUrl(value, maximumBytes = 1_000_000) {
    const text = String(value || '');
    if (!text || text.length > Math.ceil(maximumBytes * 4 / 3) + 64) return null;
    const match = text.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/u);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > maximumBytes || !SIGNATURES[mimeType](buffer)) return null;
    return {
        mimeType,
        base64: buffer.toString('base64'),
        dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
        bytes: buffer.length
    };
}

module.exports = { parseImageDataUrl };
