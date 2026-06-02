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
        if (!apiKey) {
            return "❌ ไม่สามารถคุยกับ AI ได้: ตรวจไม่พบ API Key บนหน้านี้";
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
        
        // 🧠 สร้างโครงสร้างคำสั่งส่งหา Google
        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        // 🔒 ถ้าหน้านั้นมีคำสั่งร้านค้า ให้ส่งเข้าไปล็อกสมอง AI ไว้เลย
        if (shopPrompt) {
            // เราแอบใส่กฎเหล็กเพิ่มเข้าไปด้วยว่าให้ตอบสั้นๆ และห้ามตอบนอกเรื่องร้านค้าเด็ดขาด
            const strictRules = `${shopPrompt} (กฎเหล็ก: ให้ตอบคำถามแบบกระชับ สั้น สรุปเนื้อหาเน้นๆ ไม่เอาน้ำ ย่อหน้าให้สั้นที่สุด และปฏิเสธการตอบคำถามที่ไม่เกี่ยวข้องกับร้านค้าหรือสินค้าชิ้นนี้อย่างสุภาพ ห้ามตอบเรื่องอื่นเด็ดขาด)`;
            
            requestBody.systemInstruction = {
                parts: [{ text: strictRules }]
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
                return "🤖 ขออภัยครับ เกิดข้อผิดพลาดที่ไม่รู้จัก";
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