'use strict';

function normalizeEmail(value) {
    if (typeof value !== 'string') return '';
    const email = value.trim().toLowerCase();
    if (!email || email.length > 254 || /[\u0000-\u001f\u007f]/u.test(email)) return '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email) ? email : '';
}

module.exports = { normalizeEmail };
