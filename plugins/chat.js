export function init(app, _clientApiKey, shopPrompt = "", backendUrl = "") {
    if (!app || document.getElementById("supreme-plugin-chat")) return;

    const apiUrl = resolveBackendUrl(backendUrl);
    const root = document.createElement("div");
    root.id = "supreme-plugin-chat";
    root.innerHTML = `
        <style>
            #supreme-plugin-chat, #supreme-plugin-chat * { box-sizing: border-box; }
            #supreme-plugin-chat {
                position: fixed;
                right: 20px;
                bottom: 86px;
                z-index: 2147482000;
                font-family: Arial, "Noto Sans Thai", sans-serif;
            }
            #supreme-plugin-chat .sp-panel {
                width: min(360px, calc(100vw - 32px));
                height: min(520px, calc(100vh - 110px));
                display: none;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                background: #ffffff;
                color: #0f172a;
                box-shadow: 0 22px 60px rgba(15, 23, 42, 0.22);
            }
            #supreme-plugin-chat.sp-open .sp-panel { display: flex; }
            #supreme-plugin-chat .sp-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 12px 14px;
                color: #ffffff;
                background: linear-gradient(135deg, #2563eb, #14b8a6);
                font-weight: 700;
            }
            #supreme-plugin-chat .sp-close {
                width: 30px;
                height: 30px;
                border: 1px solid rgba(255,255,255,.35);
                border-radius: 8px;
                color: #ffffff;
                background: rgba(255,255,255,.16);
                cursor: pointer;
                font-size: 18px;
            }
            #supreme-plugin-chat .sp-messages {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 12px;
                overflow: auto;
                background: #f8fafc;
            }
            #supreme-plugin-chat .sp-msg {
                max-width: 88%;
                padding: 9px 11px;
                border-radius: 8px;
                font-size: 14px;
                line-height: 1.5;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
            }
            #supreme-plugin-chat .sp-user {
                align-self: flex-end;
                color: #ffffff;
                background: #2563eb;
            }
            #supreme-plugin-chat .sp-ai {
                align-self: flex-start;
                border: 1px solid #e2e8f0;
                background: #ffffff;
                color: #0f172a;
            }
            #supreme-plugin-chat .sp-form {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 8px;
                padding: 10px;
                border-top: 1px solid #e2e8f0;
                background: #ffffff;
            }
            #supreme-plugin-chat .sp-input {
                min-height: 40px;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                padding: 9px 10px;
                outline: none;
                font: inherit;
            }
            #supreme-plugin-chat .sp-send,
            #supreme-plugin-chat .sp-launch {
                border: 0;
                border-radius: 8px;
                color: #ffffff;
                background: #2563eb;
                font-weight: 700;
                cursor: pointer;
            }
            #supreme-plugin-chat .sp-send { padding: 0 14px; }
            #supreme-plugin-chat .sp-launch {
                display: block;
                margin-left: auto;
                margin-top: 10px;
                padding: 12px 15px;
                border-radius: 999px;
                box-shadow: 0 12px 28px rgba(37, 99, 235, .28);
            }
            @media (max-width: 520px) {
                #supreme-plugin-chat {
                    left: 12px;
                    right: 12px;
                }
                #supreme-plugin-chat .sp-panel { width: auto; }
            }
        </style>
        <section class="sp-panel" aria-label="Supreme AI Chat">
            <div class="sp-header">
                <span>Supreme AI Chat</span>
                <button class="sp-close" type="button" aria-label="ปิดแชท">×</button>
            </div>
            <div class="sp-messages"></div>
            <form class="sp-form">
                <input class="sp-input" placeholder="พิมพ์ข้อความ..." autocomplete="off">
                <button class="sp-send" type="submit">ส่ง</button>
            </form>
        </section>
        <button class="sp-launch" type="button">เปิดแชทช่วยเหลือ</button>
    `;

    app.appendChild(root);

    const messages = root.querySelector(".sp-messages");
    const form = root.querySelector(".sp-form");
    const input = root.querySelector(".sp-input");
    const launch = root.querySelector(".sp-launch");
    const close = root.querySelector(".sp-close");
    const adaptiveStyle = document.createElement("style");
    adaptiveStyle.id = "supreme-plugin-adaptive-style";
    document.head.appendChild(adaptiveStyle);

    addMessage(messages, "ai", "สวัสดีครับ สอบถามข้อมูลบนหน้าเว็บนี้ได้เลย");

    launch.addEventListener("click", () => setOpen(true));
    close.addEventListener("click", () => setOpen(false));
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const text = input.value.trim();
        if (!text) return;

        input.value = "";
        addMessage(messages, "user", text);
        const loading = addMessage(messages, "ai", "กำลังคิด...");

        const aiData = await askThroughBackend(apiUrl, text, shopPrompt);
        loading.textContent = aiData.reply;

        if (isSafeCss(aiData.cssCommand)) {
            adaptiveStyle.textContent += `\n/* Supreme AI adaptive update */\n${aiData.cssCommand.trim()}\n`;
        }
        messages.scrollTop = messages.scrollHeight;
    });

    function setOpen(open) {
        root.classList.toggle("sp-open", open);
        launch.textContent = open ? "ซ่อนแชท" : "เปิดแชทช่วยเหลือ";
        if (open) input.focus();
    }
}

function resolveBackendUrl(backendUrl) {
    if (backendUrl && backendUrl.trim()) return backendUrl.trim();
    try {
        return new URL("../api/chat", import.meta.url).href;
    } catch {
        return "/api/chat";
    }
}

async function askThroughBackend(apiUrl, prompt, shopPrompt) {
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt,
                shopPrompt,
                pageContent: document.body.textContent.replace(/\s+/g, " ").trim().slice(0, 6000),
                title: document.title,
                url: location.href
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { reply: data.error || "ระบบตอบกลับไม่สำเร็จ", cssCommand: "" };
        }
        return {
            reply: typeof data.reply === "string" ? data.reply : "ขออภัยครับ ระบบยังตอบไม่ได้ในตอนนี้",
            cssCommand: typeof data.cssCommand === "string" ? data.cssCommand : ""
        };
    } catch (error) {
        console.error("Backend connection error:", error);
        return { reply: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง", cssCommand: "" };
    }
}

function addMessage(container, role, text) {
    const item = document.createElement("div");
    item.className = `sp-msg sp-${role}`;
    item.textContent = text;
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
    return item;
}

function isSafeCss(css) {
    if (!css || typeof css !== "string") return false;
    return !/(<|>|@import|url\s*\(|javascript:|expression\s*\()/i.test(css);
}
