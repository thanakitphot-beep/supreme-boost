'use strict';
function isPublicAsset(pathname) {
    if (typeof pathname !== 'string' || /[%\\\x00]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) return false;
    if (/^\/(?:manifest\.json|sw\.js)$/.test(pathname)) return true;
    if (/^\/[a-zA-Z0-9_-]+\.(?:html|png|jpg|jpeg|svg|ico)$/.test(pathname)) return true;
    return /^\/(?:styles|plugins|supreme-boost)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:js|css|png|jpg|jpeg|svg|woff|woff2)$/.test(pathname);
}
module.exports = { isPublicAsset };
