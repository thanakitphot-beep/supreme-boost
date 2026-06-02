// นำเข้าปลั๊กอินต่างๆ ที่อยู่ในโฟลเดอร์เดียวกัน
import { init as initDarkMode } from './darkmode.js';
import { init as initChat } from './chat.js';

export function loadPlugins(app) {
    console.log("📦 Plugin Manager: กำลังเปิดใช้งานปลั๊กอินทั้งหมด...");

    // สั่งรัน Dark Mode
    try {
        initDarkMode(app);
        console.log("✅ ปลั๊กอิน Dark Mode พร้อมใช้งาน");
    } catch (error) {
        console.error("❌ โหลด Dark Mode ล้มเหลว:", error);
    }

    // สั่งรัน แชท AI
    try {
        initChat(app);
        console.log("✅ ปลั๊กอิน Chat AI พร้อมใช้งาน");
    } catch (error) {
        console.error("❌ โหลด Chat AI ล้มเหลว:", error);
    }
}