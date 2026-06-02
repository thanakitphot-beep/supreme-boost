import { init as initDarkMode } from './darkmode.js';
import { init as initChat } from './chat.js';

export function loadPlugins(app, apiKey, shopPrompt, backendUrl) {
    console.log("📦 Plugin Manager: กำลังเปิดใช้งานปลั๊กอินทั้งหมด...");

    try {
        initDarkMode(app);
    } catch (error) {
        console.error("❌ โหลด Dark Mode ล้มเหลว:", error);
    }

    try {
        // ➕ ส่ง shopPrompt + backendUrl เข้าแชท
        initChat(app, apiKey, shopPrompt, backendUrl);
        console.log("✅ ปลั๊กอิน Chat AI พร้อมใช้งาน");
    } catch (error) {
        console.error("❌ โหลด Chat AI ล้มเหลว:", error);
    }
}