export function init(app, apiKey) {
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

    // ฟังก์ชันเชื่อมต่อคุยกับสมอง Gemini API
    async function askGemini(prompt) {
        if (!apiKey) {
            return "❌ ไม่สามารถคุยกับ AI ได้: ตรวจไม่พบ API Key บนหน้านี้";
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();
            
            // ดึงข้อความคำตอบออกมาแสดง
            if (data.candidates && data.candidates[0].content.parts[0].text) {
                return data.candidates[0].content.parts[0].text;
            } else {
                return "🤖 ขออภัยครับ คีย์นี้อาจจะใช้งานไม่ได้ หรือยอดใช้งานฟรีของวันนี้น่าจะเต็มแล้ว";
            }
        } catch (error) {
            console.error("Error:", error);
            return "❌ เชื่อมต่อกับสมอง AI ล้มเหลว กรุณาลองใหม่อีกครั้ง";
        }
    }

    input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter" && input.value.trim()) {
            const text = input.value.trim();
            
            messages.innerHTML += `<div style="margin-top:8px; color:#555;">👤 ${text}</div>`;
            input.value = "";
            messages.scrollTop = messages.scrollHeight;

            // สร้างข้อความจำลอง "กำลังคิด..." รอไว้ก่อน
            const tempId = "loading-" + Date.now();
            messages.innerHTML += `<div id="${tempId}" style="margin-top:8px; color:#2563eb;">🤖 กำลังคิด...</div>`;
            messages.scrollTop = messages.scrollHeight;

            // วิ่งไปขอคำตอบจริงจาก Gemini
            const aiReply = await askGemini(text);

            // เมื่อได้คำตอบจริง ให้เอาไปสลับแทนที่คำว่า "กำลังคิด..."
            const loadingDiv = messages.querySelector(`#${tempId}`);
            if (loadingDiv) {
                loadingDiv.style.color = "#000000";
                // แทนที่การเว้นบรรทัด \n ให้แสดงผลใน HTML ได้สวยงาม
                loadingDiv.innerHTML = `🤖 ${aiReply.replace(/\n/g, '<br>')}`;
            }
            messages.scrollTop = messages.scrollHeight;
        }
    });
}