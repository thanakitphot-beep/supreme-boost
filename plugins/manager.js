import { init as initDarkMode } from './darkmode.js';
import { init as initChat } from './chat.js';

export function loadPlugins(app, apiKey) {
    console.log("📦 Plugin Manager: กำลังเปิดใช้งานปลั๊กอินทั้งหมด...");

    try {
        initDarkMode(app);
        console.log("✅ ปลั๊กอิน Dark Mode พร้อมใช้งาน");
    } catch (error) {
        console.error("❌ โหลด Dark Mode ล้มเหลว:", error);
    }

    try {
        // ส่ง apiKey เข้าไปในฟังก์ชันของแชท
        initChat(app, apiKey);
        console.log("✅ ปลั๊กอิน Chat AI พร้อมใช้งาน");
    } catch (error) {
        console.error("❌ โหลด Chat AI ล้มเหลว:", error);
    }
}