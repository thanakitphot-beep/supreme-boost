'use strict';

/**
 * Keep-Alive Service
 * สำหรับ Render Free Plan — ping ตัวเองทุก 8 นาที (safe margin ก่อน 15 นาที sleep)
 * เพื่อป้องกัน Server จากการ Sleep
 *
 * เปิดใช้งานโดยตั้งค่า RENDER_EXTERNAL_URL=https://your-app.onrender.com
 * ใน Environment Variables ของ Render Dashboard
 */

const PING_INTERVAL_MS = 8 * 60 * 1000; // ทุก 8 นาที (safe margin ก่อน 15 นาที)
const HEALTH_PATH = '/api/v1/health';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 15 * 1000; // retry หลัง 15 วิ ถ้า ping ล้มเหลว

let pingTimer = null;
let consecutiveFailures = 0;

function getServiceUrl() {
    const url = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_URL;
    if (!url) return null;
    return url.replace(/\/$/, '') + HEALTH_PATH;
}

async function pingOnce(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'INDICATOR-KeepAlive/1.0' }
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`Health endpoint returned HTTP ${res.status}`);
        return res.status;
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

async function ping() {
    const url = getServiceUrl();
    if (!url) return;

    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
        try {
            const status = await pingOnce(url);
            consecutiveFailures = 0;
            console.log(`[KeepAlive] ✅ Ping OK → ${status} (${url})`);
            return;
        } catch (err) {
            attempt++;
            if (attempt <= MAX_RETRIES) {
                console.warn(`[KeepAlive] ⚠️ Ping failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message} — retrying in ${RETRY_DELAY_MS / 1000}s`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            } else {
                consecutiveFailures++;
                console.warn(`[KeepAlive] ❌ Ping failed after ${MAX_RETRIES} retries: ${err.message} (consecutive failures: ${consecutiveFailures})`);
            }
        }
    }
}

function start() {
    const url = getServiceUrl();
    if (!url) {
        console.log('[KeepAlive] ⏭️ RENDER_EXTERNAL_URL not set — keep-alive disabled (OK for local dev)');
        return;
    }

    // Ping ครั้งแรกหลังจากเซิร์ฟเวอร์เริ่มทำงาน 20 วิ
    setTimeout(ping, 20 * 1000);

    // Ping ต่อเนื่องทุก 8 นาที
    pingTimer = setInterval(ping, PING_INTERVAL_MS);

    // ไม่ให้ Timer นี้ค้างโปรเซสไว้ถ้า shutdown
    if (pingTimer.unref) pingTimer.unref();

    console.log(`[KeepAlive] 🟢 Started — pinging every 8 min → ${url}`);
}

function stop() {
    if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
        consecutiveFailures = 0;
        console.log('[KeepAlive] 🔴 Stopped');
    }
}

module.exports = { start, stop, ping };
