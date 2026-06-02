import { loadPlugins } from '../plugins/manager.js';

console.log("🚀 Supreme Boost Core: กำลังเริ่มต้นระบบ...");

function initCore() {
    const app = document.body;

    // ค้นหาแท็กสคริปต์ของตัวเองเพื่อดึง API Key ออกมา
    const scriptTag = document.querySelector('script[src*="boost.js"]');
    const apiKey = scriptTag ? scriptTag.getAttribute('data-gemini-key') : null;

    // ส่งแอป และ คีย์ ต่อไปให้ตัวจัดการปลั๊กอิน
    loadPlugins(app, apiKey);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCore);
} else {
    initCore();
}