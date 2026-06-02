export function init(app) {
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
    chat.style.color = "#000000"; // ล็อคสีตัวอักษรหลักไม่ให้กลืนหายเวลาเปิดโหมดมืด

    chat.innerHTML = `
        <div style="background:#2563eb; color:white; padding:10px; border-radius:10px 10px 0 0; font-weight:bold;">
            Supreme AI Chat
        </div>
        <div id="messages" style="flex:1; padding:10px; overflow:auto; background:#ffffff;">
            <div style="margin-top:4px;">🤖 สวัสดีครับ ผมคือ Supreme AI</div>
        </div>
        <input id="input" placeholder="พิมพ์ข้อความ..." style="border:none; border-top:1px solid #ddd; padding:10px; outline:none; background:#ffffff; color:#000000;">
    `;

    app.appendChild(chat);

    const input = chat.querySelector("#input");
    const messages = chat.querySelector("#messages");

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) {
            const text = input.value.trim();
            
            // แสดงข้อความที่เราพิมพ์
            messages.innerHTML += `
                <div style="margin-top:8px; color:#000000;">
                    👤 ${text}
                </div>
            `;
            
            input.value = "";
            messages.scrollTop = messages.scrollHeight;

            // AI ตอบกลับหลังผ่านไป 0.5 วินาที
            setTimeout(() => {
                messages.innerHTML += `
                    <div style="margin-top:8px; color:#000000;">
                        🤖 คุณพิมพ์ว่า: ${text}
                    </div>
                `;
                messages.scrollTop = messages.scrollHeight;
            }, 500);
        }
    });
}