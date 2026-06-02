// plugins/chat.js (เวอร์ชัน Gemini อัจฉริยะ: แอบอ่านหน้าเว็บสดๆ + คุยฟรีเสถียร)

export function init(app, apiKey, shopPrompt) {
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
            Supreme AI Chat (Gemini Auto-Scan)
        </div>
        <div id="messages" style="flex:1; padding:10px; overflow:auto; background:#ffffff;">
            <div style="margin-top:4px;">🤖 สวัสดีครับ มีอะไรให้ผมช่วยไหมครับ? สามารถสอบถามข้อมูลสินค้าบนหน้าเว็บนี้ได้เลยครับ!</div>
        </div>
        <input id="input" placeholder="พิมพ์ข้อความ..." style="border:none; border-top:1px solid #ddd; padding:10px; outline:none; background:#ffffff; color:#000000;">
    `;

    app.appendChild(chat);

    const input = chat.querySelector("#input");
    const messages = chat.querySelector("#messages");

    // 2. ฟังก์ชันหลักในการส่งคำขอไปหา Gemini พร้อมแอบยัดข้อมูลหน้าเว็บเข้าไปด้วย
    async function askGemini(userPrompt) {
        if (!apiKey || apiKey.trim() === "" || apiKey.includes("คีย์ของคุณ")) {
            return "❌ ไม่สามารถคุยกับ AI ได้: ตรวจไม่พบ Gemini API Key";
        }

        // ใช้โมเดลรุ่น Flash-Lite เพื่อหลบเลี่ยงปัญหา High Demand และได้ความเร็วสูงสุด
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

        // 🔥 [จุดสำคัญ] สั่งให้สคริปต์ไปกวาดข้อความตัวอักษรทั้งหมดที่อยู่บนหน้าเว็บปัจจุบันแบบ Real-time
        // ยกเว้นส่วนที่เป็นกล่องแชทเพื่อป้องกันไม่ให้ข้อความแชทเก่าๆ ไหลปนเข้าไปสับสน
        const pageContent = document.body.innerText.replace(chat.innerText, "").trim();

        // จัดการรวมร่าง: คำสั่งร้านค้าเดิม + เนื้อหาที่แอบกวาดมาจากหน้าเว็บ
        const combinedSystemInstruction = `
            ${shopPrompt}
            
            [ข้อมูลที่ดึงมาจากหน้าเว็บปัจจุบันที่คุณกำลังทำหน้าที่อยู่]:
            ${pageContent}
            
            [กฎเหล็กในการตอบคำถาม]:
            1. คุณต้องสวมบทบาทเป็นแอดมินของร้านค้านี้อย่างเคร่งครัด
            2. ให้ตอบคำถามโดยอ้างอิงและใช้ประโยชน์จาก "ข้อมูลที่ดึงมาจากหน้าเว็บปัจจุบัน" ด้านบนนี้เป็นหลัก
            3. ตอบคำถามอย่างสุภาพ กระชับ สั้น ได้ใจความ ไม่เอาน้ำ ย่อหน้าให้สั้นอ่านง่าย
            4. หากลูกค้าถามคำถามที่ไม่เกี่ยวข้องกับสินค้า บริการ หรือข้อมูลบนหน้าเว็บนี้เลย ให้ปฏิเสธการตอบอย่างสุภาพ (เช่น "ขออภัยครับ ผมทำหน้าที่เป็นแอดมินคอยให้ข้อมูลของร้านค้านี้เท่านั้น ไม่สามารถตอบเรื่องอื่นได้ครับ") ห้ามหลุดไปคุยเรื่องอื่นเด็ดขาด
        `;

        const requestBody = {
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: {
                parts: [{ text: combinedSystemInstruction }]
            }
        };

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.candidates && data.candidates[0].content.parts[0].text) {
                return data.candidates[0].content.parts[0].text;
            } else if (data.error) {
                return `🚨 Google แจ้งปัญหา: ${data.error.message}`;
            } else {
                return "🤖 ขออภัยครับ เกิดข้อผิดพลาดที่ไม่รู้จักในการประมวลผลคำตอบ";
            }
        } catch (error) {
            return "❌ เชื่อมต่อกับสมอง AI ล้มเหลว";
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

            // เรียกทำงานฟังก์ชันถาม AI (ซึ่งรอบนี้จะแอบสแกนหน้าเว็บไปด้วยอัตโนมัติ)
            const aiReply = await askGemini(text);

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