'use strict';

/**
 * Keep-Alive Service
 * สำหรับ Render Free Plan — ping ตัวเองทุก 10 นาที
 * เพื่อป้องกัน Server จากการ Sleep (ซึ่ง Free Plan จะ Sleep หลัง 15 นาที)
 *
 * เปิดใช้งานโดยตั้งค่า RENDER_EXTERNAL_URL=https://your-app.onrender.com
 * ใน Environment Variables ของ Render Dashboard
 */

const PING_INTERVAL_MS = 10 * 60 * 1000; // ทุก 10 นาที
const HEALTH_PATH = '/api/v1/health';

let pingTimer = null;

function getServiceUrl() {
    // ใช้ URL จาก Render Environment Variable
    const url = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_URL;
    if (!url) return null;
    return url.replace(/\/$/, '') + HEALTH_PATH;
}

async function ping() {
    const url = getServiceUrl();
    if (!url) return;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'INDICATOR-KeepAlive/1.0' }
        });

        clearTimeout(timeout);
        console.log(`[KeepAlive] ✅ Ping ${url} → ${res.status}`);
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.warn(`[KeepAlive] ⚠️ Ping failed: ${err.message}`);
        }
    }
}

function start() {
    const url = getServiceUrl();
    if (!url) {
        console.log('[KeepAlive] ⏭️ RENDER_EXTERNAL_URL not set — keep-alive disabled (OK for local dev)');
        return;
    }

    // Ping ครั้งแรกหลังจากเซิร์ฟเวอร์เริ่มทำงาน 30 วิ
    setTimeout(ping, 30 * 1000);

    // Ping ต่อเนื่องทุก 10 นาที
    pingTimer = setInterval(ping, PING_INTERVAL_MS);

    // ไม่ให้ Timer นี้ค้างโปรเซสไว้ถ้า shutdown
    if (pingTimer.unref) pingTimer.unref();

    console.log(`[KeepAlive] 🟢 Started — pinging every 10 min → ${url}`);
}

function stop() {
    if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
        console.log('[KeepAlive] 🔴 Stopped');
    }
}

module.exports = { start, stop, ping };
