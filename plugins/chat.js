// plugins/chat.js

document.addEventListener("DOMContentLoaded", () => {
    // 1. ดึงองค์ประกอบต่างๆ ของหน้าต่างแชทมาเตรียมไว้
    const chatWidget = document.getElementById("supreme-chat-widget");
    if (!chatWidget) return;

    const messagesContainer = chatWidget.querySelector(".chat-messages");
    const inputField = chatWidget.querySelector(".chat-input-field");
    const sendButton = chatWidget.querySelector(".chat-send-btn");
    const scriptTag = document.querySelector("script[src*='boost.js']");

    // 2. อ่านค่า API Key และคำสั่งร้านค้า (Prompt) จากแท็ก Script
    const apiKey = scriptTag ? scriptTag.getAttribute("data-gemini-key") : null; 
    // หมายเหตุ: ถึงแม้ชื่อ Attribute จะเป็น data-gemini-key แต่เราเอามาใส่คีย์ OpenAI (sk-...) แทนได้เลยครับ
    const shopPrompt = scriptTag ? scriptTag.getAttribute("data-shop-prompt") : "";

    // 3. ฟังก์ชันสำหรับเพิ่มกล่องข้อความลงในหน้าแชท
    function appendMessage(sender, text) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("chat-message", sender === "user" ? "user-message" : "bot-message");
        
        // กำหนดไอคอนตามผู้ส่ง
        const icon = sender === "user" ? "👤" : "🤖";
        messageDiv.innerHTML = `<span class="message-icon">${icon}</span> <span class="message-text">${text}</span>`;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight; // เลื่อนหน้าจอลงล่างสุดอัตโนมัติ
    }

    // 4. ฟังก์ชันส่งคำขอไปหาสมอง OpenAI (ChatGPT) รุ่น gpt-4o-mini
    async function askOpenAI(userPrompt) {
        if (!apiKey || apiKey.trim() === "" || apiKey.includes("คีย์ของคุณ")) {
            return "❌ ไม่สามารถเชื่อมต่อ AI ได้: ตรวจไม่พบ OpenAI API Key (คีย์ต้องขึ้นต้นด้วย sk-...)";
        }

        // ลิงก์ API Endpoint ของ OpenAI
        const url = "https://api.openai.com/v1/chat/completions";
        
        // จัดโครงสร้างกล่องข้อความ (Messages Array)
        const messages = [];
        
        // ถ้าผู้ใช้ใส่รายละเอียดร้านค้าไว้ ให้ล็อกสมอง AI ด้วยบทบาท System
        if (shopPrompt && shopPrompt.trim() !== "") {
            const strictRules = `${shopPrompt} (กฎเหล็ก: คุณต้องสวมบทบาทเป็นแอดมินร้านนี้เท่านั้น ตอบคำถามอย่างสุภาพ กระชับ มั่นใจ ย่อหน้าให้สั้นอ่านง่าย และต้องปฏิเสธการตอบคำถามที่ไม่เกี่ยวข้องกับสินค้าหรือบริการของร้านค้าอย่างสุภาพ ห้ามคุยเรื่องอื่นนอกเหนือจากนี้เด็ดขาด)`;
            messages.push({ role: "system", content: strictRules });
        }
        
        // ใส่ข้อความล่าสุดที่ลูกค้าพิมพ์ถามเข้ามา
        messages.push({ role: "user", content: userPrompt });

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}` // ส่งคีย์ไปยืนยันตัวตน
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini", // เลือกใช้รุ่นมินิที่ฉลาด เสถียร และประหยัดค่าใช้จ่าย
                    messages: messages,
                    temperature: 0.5 // ตั้งค่าให้ AI ตอบอยู่ในกรอบความจริง ไม่คิดคำตอบเพ้อฝันเกินไป
                })
            });

            const data = await response.json();

            // ส่งคำตอบกลับไปแสดงผลถ้าทำรายการสำเร็จ
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content;
            } 
            // ดักจับกรณีที่ OpenAI ส่ง Error แจ้งปัญหากลับมา
            else if (data.error) {
                console.error("OpenAI Error:", data.error);
                return `🚨 OpenAI แจ้งปัญหา: <br><span style="color:#d93025; font-size:12px; display:block; margin-top:4px;">${data.error.message}</span>`;
            } else {
                return "🤖 ขออภัยครับ ระบบส่งข้อมูลกลับมาในรูปแบบที่ไม่ถูกต้อง";
            }

        } catch (error) {
            console.error("Fetch API Error:", error);
            return "❌ การเชื่อมต่อล้มเหลว: ไม่สามารถส่งข้อมูลไปยังเซิร์ฟเวอร์ OpenAI ได้";
        }
    }

    // 5. ฟังก์ชันหลักเมื่อผู้ใช้กดส่งข้อความ
    async function handleSendMessage() {
        const text = inputField.value.trim();
        if (!text) return; // ถ้าช่องว่างเปล่า ไม่ต้องส่ง

        // แสดงข้อความฝั่งผู้ใช้ขึ้นจอ และล้างช่องกรอกข้อมูล
        appendMessage("user", text);
        inputField.value = "";

        // แสดงสถานะว่าบอทกำลังคิดพิมพ์อยู่
        const typingDiv = document.createElement("div");
        typingDiv.classList.add("chat-message", "bot-message", "typing-indicator");
        typingDiv.innerHTML = `<span class="message-icon">🤖</span> <span class="message-text">กำลังคิด...</span>`;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // เรียกใช้งานฟังก์ชันถาม OpenAI
        const aiResponse = await askOpenAI(text);

        // เอาสถานะ "กำลังคิด..." ออก แล้วแสดงคำตอบจริงจาก OpenAI
        typingDiv.remove();
        appendMessage("bot", aiResponse);
    }

    // 6. ตรวจจับการคลิกปุ่มส่ง และการกดปุ่ม Enter
    sendButton.addEventListener("click", handleSendMessage);
    inputField.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            handleSendMessage();
        }
    });
});