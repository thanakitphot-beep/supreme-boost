import { loadPlugins } from '../plugins/manager.js';

console.log("🚀 Supreme Boost Core: กำลังเริ่มต้นระบบ...");

function initCore() {
    const app = document.body;

    const scriptTag = document.querySelector('script[src*="boost.js"]');
    const apiKey = scriptTag ? scriptTag.getAttribute('data-gemini-key') : null;
    // ➕ ดึงคำสั่งตั้งค่าร้านค้าเพิ่มเข้ามา
    const shopPrompt = scriptTag ? scriptTag.getAttribute('data-shop-prompt') : '';
    // ➕ ดึง URL ของ Backend (จำเป็น!)
    const backendUrl = scriptTag ? scriptTag.getAttribute('data-backend-url') : '';

    // ส่งค่าทั้งหมดต่อไปให้ manager
    loadPlugins(app, apiKey, shopPrompt, backendUrl);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCore);
} else {
    initCore();
}