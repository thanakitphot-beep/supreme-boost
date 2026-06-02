// plugins/chat.js (เวอร์ชันย้ายกลับมา Gemini แบบฟรี 100%)

export function init(app, apiKey, shopPrompt) {
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
            Supreme AI Chat (Gemini)
        </div>
        <div id="messages" style="flex:1; padding:10px; overflow:auto; background:#ffffff;">
            <div style="margin-top:4px;">🤖 สวัสดีครับ มีอะไรให้ผมช่วยไหมครับ?</div>
        </div>
        <input id="input" placeholder="พิมพ์ข้อความ..." style="border:none; border-top:1px solid #ddd; padding:10px; outline:none; background:#ffffff; color:#000000;">
    `;

    app.appendChild(chat);

    const input = chat.querySelector("#input");
    const messages = chat.querySelector("#messages");

    async function askGemini(prompt) {
        if (!apiKey || apiKey.trim() === "" || apiKey.includes("คีย์ของคุณ")) {
            return "❌ ไม่สามารถคุยกับ AI ได้: ตรวจไม่พบ Gemini API Key";
        }

        // ย้ายกลับมาใช้สมองรุ่นเสถียรของ Gemini
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        // ถ้ามีการกำหนดเงื่อนไขร้านค้า ให้แนบ System Instruction ไปล็อกสมองตามโครงสร้างของ Gemini
        if (shopPrompt && shopPrompt.trim() !== "") {
            requestBody.systemInstruction = {
                parts: [{ text: `${shopPrompt} (กฎเหล็ก: ตอบคำถามอย่างสุภาพ กระชับ มั่นใจ ย่อหน้าให้สั้นอ่านง่าย และต้องปฏิเสธการตอบคำถามที่ไม่เกี่ยวข้องกับร้านค้าอย่างสุภาพ ห้ามคุยเรื่องอื่นเด็ดขาด)` }]
            };
        }

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
                return "🤖 ขออภัยครับ เกิดข้อผิดพลาดที่ไม่รู้จักในการดึงข้อมูล";
            }
        } catch (error) {
            return "❌ เชื่อมต่อกับสมอง AI ล้มเหลว";
        }
    }

    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && input.value.trim()) {
            const text = input.value.trim();
            
            messages.innerHTML += `<div style="margin-top:8px; color:#555;">👤 ${text}</div>`;
            input.value = "";
            messages.scrollTop = messages.scrollHeight;

            const tempId = "loading-" + Date.now();
            messages.innerHTML += `<div id="${tempId}" style="margin-top:8px; color:#2563eb;">🤖 กำลังคิด...</div>`;
            messages.scrollTop = messages.scrollHeight;

            const aiReply = await askGemini(text);

            const loadingDiv = messages.querySelector(`#${tempId}`);
            if (loadingDiv) {
                loadingDiv.style.color = "#000000";
                loadingDiv.innerHTML = `🤖 ${aiReply.replace(/\n/g, '<br>')}`;
            }
            messages.scrollTop = messages.scrollHeight;
        }
    });
}