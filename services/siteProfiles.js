'use strict';

/**
 * Per-site identity and knowledge registry.
 *
 * A browser plugin key identifies a site; it is deliberately NOT an admin
 * credential.  Connector secrets and write permissions must stay on the
 * customer's server or in INDICATOR's protected backend.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROFILES_PATH = path.join(__dirname, '..', 'data', 'site-profiles.json');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function readProfiles() {
    try {
        const data = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
        return Array.isArray(data.profiles) ? data.profiles : [];
    } catch (error) {
        console.error('[SiteProfiles] Could not load profiles:', error.message);
        return [];
    }
}

function safeEqual(left, right) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Resolve a public site identity.  The returned record contains only content
 * that is safe for the customer-facing agent to use.
 */
function resolveSiteProfile(siteKey) {
    if (!siteKey || typeof siteKey !== 'string') return null;
    const profile = readProfiles().find(item => safeEqual(item.siteKey, siteKey));
    if (!profile || profile.status !== 'active') return null;
    return clone({
        id: profile.id,
        allowedOrigins: Array.isArray(profile.allowedOrigins) ? profile.allowedOrigins : [],
        identity: profile.identity && typeof profile.identity === 'object' ? profile.identity : {},
        permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
        knowledge: profile.knowledge && typeof profile.knowledge === 'object' ? profile.knowledge : {},
        useDefaultKnowledge: profile.useDefaultKnowledge === true,
        updatedAt: profile.updatedAt || null
    });
}

function originIsAllowed(profile, origin) {
    // Server-to-server and local API tests do not send Origin.  Browser
    // enforcement is applied only when strict site-origin mode is enabled.
    if (!origin) return true;
    if (!profile || !Array.isArray(profile.allowedOrigins) || !profile.allowedOrigins.length) return false;
    return profile.allowedOrigins.includes(origin);
}

function inferSiteIdentity(payload = {}) {
    const profileIdentity = payload.siteProfile && payload.siteProfile.identity;
    if (profileIdentity && profileIdentity.name) return clone(profileIdentity);

    const siteDNA = payload.siteDNA && typeof payload.siteDNA === 'object' ? payload.siteDNA : {};
    const title = String(payload.title || siteDNA.title || 'เว็บไซต์นี้').replace(/\s+/g, ' ').trim().slice(0, 120);
    const hasCatalog = (payload.siteProfile && payload.siteProfile.knowledge && Array.isArray(payload.siteProfile.knowledge.catalog))
        || (Array.isArray(siteDNA.entities) && siteDNA.entities.length > 0);

    return {
        name: `${title || 'INDICATOR'} Assistant`,
        role: hasCatalog ? 'ผู้ช่วยฝ่ายขายและบริการลูกค้า' : 'ผู้ช่วยข้อมูลเว็บไซต์',
        purpose: hasCatalog
            ? 'ช่วยค้นหาข้อมูลสินค้าและบริการจากข้อมูลที่เว็บไซต์อนุญาต'
            : 'ช่วยค้นหา อธิบาย และพาไปยังข้อมูลบนเว็บไซต์',
        tone: 'สุภาพ ชัดเจน และไม่คาดเดาข้อมูลที่ไม่มีแหล่งอ้างอิง'
    };
}

module.exports = { resolveSiteProfile, originIsAllowed, inferSiteIdentity };
