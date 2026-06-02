// ดึงตัวจัดการปลั๊กอินเข้ามาทำงาน (ถอยหลัง 1 ก้าวออกไปหาโฟลเดอร์ plugins)
import { loadPlugins } from '../plugins/manager.js';

console.log("🚀 Supreme Boost Core: กำลังเริ่มต้นระบบ...");

function initCore() {
    const app = document.body;
    loadPlugins(app);
}

// รอให้หน้าเว็บโหลดโครงสร้างเสร็จแล้วลุยเลย
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCore);
} else {
    initCore();
}