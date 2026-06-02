import { init as initDarkMode } from "./darkmode.js";
import { init as initChat } from "./chat.js";

export function loadPlugins(app, apiKey = "", shopPrompt = "", backendUrl = "") {
    console.log("Plugin Manager: กำลังเปิดใช้งานปลั๊กอิน Supreme Boost...");

    try {
        initDarkMode(app);
    } catch (error) {
        console.error("โหลด Dark Mode ไม่สำเร็จ:", error);
    }

    try {
        initChat(app, apiKey, shopPrompt, backendUrl);
        console.log("Plugin Manager: Chat AI พร้อมใช้งาน");
    } catch (error) {
        console.error("โหลด Chat AI ไม่สำเร็จ:", error);
    }
}
