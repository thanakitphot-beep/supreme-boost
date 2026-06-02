// plugins/chat.js (เวอร์ชันซ่อนคีย์ปลอดภัย: ส่งผ่าน Backend เพื่อให้คนอื่นนำไปแปะใช้ได้ทันที)

export function init(app, clientApiKey, shopPrompt) {
    // หมายเหตุ: เราเอา clientApiKey ออกจากการเช็กบน Frontend แล้ว เพื่อให้คนอื่นเรียกใช้ได้โดยไม่ต้องกรอกคีย์
    
    // 1. สร้างหน้าต่างกล่องแชทบนหน้าจอ (ตามโครงสร้างระบบเดิมของคุณ)
    const chat = document.createElement("div");
    chat.style.position = "fixed";
    chat.style.left = "20px";
    chat.style.bottom = "20px";
    chat.style.width = "320px";
    chat.style.height = "400px";
    chat.style.background = "#ffffff";
    chat.style.border = "1px solid #ccc";
    chat.style.borderRadius = "10px";
    chat.style.zIndex = "999999";
    chat.style.boxShadow = "0 0 10px rgba(0,0,0,.2)";
    chat.style.display = "flex";
    chat.style.flexDirection = "column";
    chat.style.fontFamily = "Arial, sans-serif";
    chat.style.color = "#000000";

    chat.innerHTML = `
        <div style="background:#2563eb; color:white; padding:10px; border-radius:10px 10px 0 0; font-weight:bold;">
            Supreme AI Chat (Secure System)
        </div>
        <div id="messages" style="flex:1; padding:10px; overflow:auto; background:#ffffff;">
            <div style="margin-top:4px;">🤖 สวัสดีครับ มีอะไรให้ผมช่วยไหมครับ? สามารถสอบถามข้อมูลสินค้าบนหน้าเว็บนี้ได้เลยครับ!</div>
        </div>
        <input id="input" placeholder="พิมพ์ข้อความ..." style="border:none; border-top:1px solid #ddd; padding:10px; outline:none; background:#ffffff; color:#000000;">
    `;

    app.appendChild(chat);

    const input = chat.querySelector("#input");
    const messages = chat.querySelector("#messages");

    // 2. ฟังก์ชันส่งคำขอไปหาเซิร์ฟเวอร์ตัวกลาง (Backend Proxy) แทนการยิงตรงหา Google
    async function askThroughBackend(userPrompt) {
        
        // 🔥 [จุดสำคัญ] เปลี่ยน URL ตรงนี้เป็น URL เซิร์ฟเวอร์ Backend ของคุณหลังจากอัปโหลดขึ้นระบบ (เช่น Vercel หรือ Render)
        const backendUrl = "https://your-supreme-backend-server.vercel.app/api/chat";

        // สั่งให้สคริปต์ไปกวาดข้อความทั้งหมดบนหน้าเว็บที่บอทไปทำงานอยู่สดๆ
        const pageContent = document.body.innerText.replace(chat.innerText, "").trim();

        // รวบรวมข้อมูลส่งไปให้ Backend จัดการครอบคีย์ลับให้ที่ฝั่งเซิร์ฟเวอร์
        const requestData = {
            prompt: userPrompt,
            pageContent: pageContent,
            shopPrompt: shopPrompt
        };

        try {
            const response = await fetch(backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestData)
            });

            const data = await response.json();

            // คืนค่าคำตอบที่ได้กลับมาจากเซิร์ฟเวอร์ตัวกลาง
            if (data.reply) {
                return data.reply;
            } else if (data.error) {
                return `🚨 ระบบตัวกลางแจ้งปัญหา: ${data.error}`;
            } else {
                return "🤖 ขออภัยครับ เซิร์ฟเวอร์ส่งข้อมูลกลับมาไม่ถูกต้อง";
            }
        } catch (error) {
            console.error("Backend connection error:", error);
            return "❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์หลักได้ (อาจจะยังไม่ได้เปิดเซิร์ฟเวอร์ตัวกลาง)";
        }
    }

    // 3. ระบบส่งข้อความเมื่อกด Enter
    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && input.value.trim()) {
            const text = input.value.trim();
            
            // แสดงข้อความที่ผู้ใช้พิมพ์
            messages.innerHTML += `<div style="margin-top:8px; color:#555;">👤 ${text}</div>`;
            input.value = "";
            messages.scrollTop = messages.scrollHeight;

            // ขึ้นสถานะกำลังคิดพิมพ์
            const tempId = "loading-" + Date.now();
            messages.innerHTML += `<div id="${tempId}" style="margin-top:8px; color:#2563eb;">🤖 กำลังคิด...</div>`;
            messages.scrollTop = messages.scrollHeight;

            // เรียกทำงานผ่านระบบ Backend ตัวกลาง
            const aiReply = await askThroughBackend(text);

            // แสดงผลคำตอบจริงลงหน้าต่างแชท
            const loadingDiv = messages.querySelector(`#${tempId}`);
            if (loadingDiv) {
                loadingDiv.style.color = "#000000";
                loadingDiv.innerHTML = `🤖 ${aiReply.replace(/\n/g, '<br>')}`;
            }
            messages.scrollTop = messages.scrollHeight;
        }
    });
}