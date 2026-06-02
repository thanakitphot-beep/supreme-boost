// plugins/chat.js

export function init(app, apiKey, shopPrompt) {
    // 1. สร้างกล่องแชทขึ้นมาบนหน้าจอใหม่ทั้งหมด (ตามโครงสร้างระบบเดิมของคุณ)
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
            Supreme AI Chat (OpenAI)
        </div>
        <div id="messages" style="flex:1; padding:10px; overflow:auto; background:#ffffff;">
            <div style="margin-top:4px;">🤖 สวัสดีครับ มีอะไรให้ผมช่วยไหมครับ?</div>
        </div>
        <input id="input" placeholder="พิมพ์ข้อความ..." style="border:none; border-top:1px solid #ddd; padding:10px; outline:none; background:#ffffff; color:#000000;">
    `;

    // นำกล่องแชทไปแปะไว้บนหน้าเว็บ
    app.appendChild(chat);

    const input = chat.querySelector("#input");
    const messages = chat.querySelector("#messages");

    // 2. ฟังก์ชันส่งคำขอไปหาสมอง OpenAI (ChatGPT) รุ่น gpt-4o-mini
    async function askOpenAI(prompt) {
        if (!apiKey || apiKey.trim() === "" || apiKey.includes("คีย์ของคุณ")) {
            return "❌ ไม่สามารถคุยกับ AI ได้: ตรวจไม่พบ OpenAI API Key (คีย์ต้องขึ้นต้นด้วย sk-...)";
        }

        const url = "https://api.openai.com/v1/chat/completions";
        const messagesArray = [];
        
        // ถ้าใส่รายละเอียดร้านค้าไว้ ให้ล็อกสมอง AI ด้วยบทบาท System ล็อกให้ตอบสั้นๆ
        if (shopPrompt && shopPrompt.trim() !== "") {
            const strictRules = `${shopPrompt} (กฎเหล็ก: คุณต้องสวมบทบาทเป็นแอดมินร้านนี้เท่านั้น ตอบคำถามอย่างสุภาพ กระชับ มั่นใจ ย่อหน้าให้สั้นอ่านง่าย และต้องปฏิเสธการตอบคำถามที่ไม่เกี่ยวข้องกับสินค้าหรือบริการของร้านค้าอย่างสุภาพ ห้ามคุยเรื่องอื่นนอกเหนือจากนี้เด็ดขาด)`;
            messagesArray.push({ role: "system", content: strictRules });
        }
        
        // ใส่ข้อความล่าสุดที่ลูกค้าถาม
        messagesArray.push({ role: "user", content: prompt });

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}` // ส่งคีย์ sk-... ผ่าน Header
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini", // ใช้รุ่นมินิที่เสถียรและประหยัดค่าใช้จ่าย
                    messages: messagesArray,
                    temperature: 0.5 // คุมให้ตอบอยู่ในกรอบความจริง
                })
            });

            const data = await response.json();
            
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content;
            } else if (data.error) {
                return `🚨 OpenAI แจ้งปัญหา: ${data.error.message}`;
            } else {
                return "🤖 ขออภัยครับ เกิดข้อผิดพลาดที่ไม่รู้จัก";
            }
        } catch (error) {
            return "❌ เชื่อมต่อกับสมอง AI ล้มเหลว";
        }
    }

    // 3. ระบบตรวจจับการพิมพ์เมื่อกด Enter
    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && input.value.trim()) {
            const text = input.value.trim();
            
            // แสดงข้อความฝั่งลูกค้า
            messages.innerHTML += `<div style="margin-top:8px; color:#555;">👤 ${text}</div>`;
            input.value = "";
            messages.scrollTop = messages.scrollHeight;

            // ขึ้นสถานะกำลังคิด
            const tempId = "loading-" + Date.now();
            messages.innerHTML += `<div id="${tempId}" style="margin-top:8px; color:#2563eb;">🤖 กำลังคิด...</div>`;
            messages.scrollTop = messages.scrollHeight;

            // เรียกใช้งาน OpenAI
            const aiReply = await askOpenAI(text);

            // แสดงคำตอบจริงแทนที่สถานะกำลังคิด
            const loadingDiv = messages.querySelector(`#${tempId}`);
            if (loadingDiv) {
                loadingDiv.style.color = "#000000";
                loadingDiv.innerHTML = `🤖 ${aiReply.replace(/\n/g, '<br>')}`;
            }
            messages.scrollTop = messages.scrollHeight;
        }
    });
}