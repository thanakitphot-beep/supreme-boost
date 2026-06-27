(function () {
    "use strict";

    const _currentScript = document.currentScript;
    console.log("[INDICATOR Guide] ✓ Initializing Full-Page AI Guide...");

    const WIDGET_ID = "supreme-guide-root";
    const STYLE_ID = "supreme-guide-style";
    const DEFAULT_TITLE = "AI Shopping Guide";
    const DEFAULT_PRIMARY = "#2563eb";

    if (window.__SUPREME_GUIDE_READY__) {
        return;
    }
    window.__SUPREME_GUIDE_READY__ = true;

    function getConfig() {
        const script = _currentScript || document.querySelector('script[src*="fullpage.js"]');
        const scriptUrl = script && script.src ? new URL(script.src, document.baseURI) : null;
        const backendFromScript = scriptUrl && scriptUrl.origin !== "null"
            ? `${scriptUrl.origin}/api/chat`
            : "/api/chat";

        return {
            title: getAttr(script, "data-title", DEFAULT_TITLE),
            shopPrompt: getAttr(script, "data-shop-prompt", ""),
            backendUrl: getAttr(script, "data-backend-url", backendFromScript),
            primary: getAttr(script, "data-primary", DEFAULT_PRIMARY)
        };
    }

    function getAttr(element, name, fallback) {
        if (!element) return fallback;
        const value = element.getAttribute(name);
        return value === null || value.trim() === "" ? fallback : value.trim();
    }

    function init() {
        if (!document.body) {
            setTimeout(init, 300);
            return;
        }

        if (document.getElementById(WIDGET_ID)) {
            return;
        }

        const config = getConfig();
        injectStyle(config);

        const root = document.createElement("div");
        root.id = WIDGET_ID;
        root.style.setProperty("--sb-primary", config.primary);

        root.innerHTML = `
            <div class="sb-overlay"></div>
            <div class="sb-container">
                <div class="sb-header">
                    <h1>🤖 ${config.title}</h1>
                    <p>พร้อมช่วยคุณค้นหาสินค้าที่ดีที่สุด</p>
                </div>
                
                <div class="sb-content">
                    <div class="sb-messages-area">
                        <div class="sb-message-item sb-assistant">
                            <div class="sb-avatar">🤖</div>
                            <div class="sb-text">
                                สวัสดีค่ะ! ยินดีต้อนรับ! 👋<br><br>
                                ฉันคือผู้ช่วยอัจฉริยะของร้านค้า สามารถช่วยคุณได้ทั้งหมด เช่น:
                                <ul class="sb-help-list">
                                    <li>🔍 ค้นหาสินค้าที่คุณต้องการ</li>
                                    <li>💰 เช็คราคาและโปรโมชัน</li>
                                    <li>📦 ตรวจสอบการจัดส่ง</li>
                                    <li>❓ ตอบคำถามเกี่ยวกับสินค้า</li>
                                    <li>🎯 ให้คำแนะนำ</li>
                                </ul>
                                <br>ลองถามคำถามของคุณสิ! 👇
                            </div>
                        </div>
                    </div>

                    <div class="sb-suggestions">
                        <button class="sb-suggestion-btn">🔍 ค้นหาสินค้า</button>
                        <button class="sb-suggestion-btn">💰 ราคาและโปรโมชัน</button>
                        <button class="sb-suggestion-btn">📦 วิธีการจัดส่ง</button>
                        <button class="sb-suggestion-btn">⭐ สินค้าขายดี</button>
                    </div>

                    <div class="sb-input-area">
                        <textarea class="sb-input-field" placeholder="พิมพ์คำถามของคุณ..." rows="3"></textarea>
                        <button class="sb-send-btn">ส่ง ➔</button>
                    </div>
                </div>

                <div class="sb-footer">
                    <button class="sb-close-btn">✕ ปิด</button>
                </div>
            </div>
        `;

        document.body.appendChild(root);

        // Setup event listeners
        const messagesArea = root.querySelector(".sb-messages-area");
        const inputField = root.querySelector(".sb-input-field");
        const sendBtn = root.querySelector(".sb-send-btn");
        const closeBtn = root.querySelector(".sb-close-btn");
        const suggestionBtns = root.querySelectorAll(".sb-suggestion-btn");

        // Send message
        const sendMessage = (text) => {
            if (!text.trim()) return;

            // Add user message
            const userMsg = document.createElement("div");
            userMsg.className = "sb-message-item sb-user";
            userMsg.innerHTML = `<div class="sb-avatar">👤</div><div class="sb-text">${text}</div>`;
            messagesArea.appendChild(userMsg);

            inputField.value = "";

            // Add loading message
            const loadingMsg = document.createElement("div");
            loadingMsg.className = "sb-message-item sb-assistant";
            loadingMsg.innerHTML = `<div class="sb-avatar">🤖</div><div class="sb-text sb-loading">กำลังคิด...</div>`;
            messagesArea.appendChild(loadingMsg);

            // Scroll to bottom
            messagesArea.scrollTop = messagesArea.scrollHeight;

            // Call API
            fetch(config.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: text,
                    pageContent: collectPageContent(),
                    shopPrompt: config.shopPrompt,
                    history: []
                })
            })
            .then(r => r.json())
            .then(data => {
                loadingMsg.querySelector(".sb-text").innerHTML = data.reply || "ขออภัยค่ะ ตอบไม่ได้ในตอนนี้";
                messagesArea.scrollTop = messagesArea.scrollHeight;
            })
            .catch(err => {
                console.error("[INDICATOR Guide] Error:", err);
                loadingMsg.querySelector(".sb-text").innerHTML = "⚠️ เชื่อมต่อไม่ได้ กรุณาลองใหม่";
                messagesArea.scrollTop = messagesArea.scrollHeight;
            });
        };

        sendBtn.addEventListener("click", () => sendMessage(inputField.value));
        inputField.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(inputField.value);
            }
        });

        suggestionBtns.forEach(btn => {
            btn.addEventListener("click", () => sendMessage(btn.textContent));
        });

        closeBtn.addEventListener("click", () => {
            root.classList.add("sb-hidden");
        });

        console.log("[INDICATOR Guide] ✓ Full-page guide loaded successfully");
    }

    function injectStyle(config) {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${WIDGET_ID}, #${WIDGET_ID} * {
                box-sizing: border-box;
                --sb-primary: ${config.primary};
            }

            #${WIDGET_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 2147483000;
                font-family: Arial, "Noto Sans Thai", sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            #${WIDGET_ID}.sb-hidden {
                display: none;
            }

            #${WIDGET_ID} .sb-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(5px);
            }

            #${WIDGET_ID} .sb-container {
                position: relative;
                z-index: 1;
                width: min(90vw, 900px);
                height: min(90vh, 700px);
                background: white;
                border-radius: 20px;
                box-shadow: 0 30px 100px rgba(0, 0, 0, 0.3);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                animation: slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }

            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }

            #${WIDGET_ID} .sb-header {
                background: linear-gradient(135deg, var(--sb-primary), #14b8a6);
                color: white;
                padding: 30px;
                text-align: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            #${WIDGET_ID} .sb-header h1 {
                margin: 0 0 10px;
                font-size: 28px;
                font-weight: 800;
            }

            #${WIDGET_ID} .sb-header p {
                margin: 0;
                font-size: 16px;
                opacity: 0.9;
            }

            #${WIDGET_ID} .sb-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                padding: 20px;
                overflow: hidden;
            }

            #${WIDGET_ID} .sb-messages-area {
                flex: 1;
                overflow-y: auto;
                padding: 10px 0;
                margin-bottom: 15px;
            }

            #${WIDGET_ID} .sb-messages-area::-webkit-scrollbar {
                width: 6px;
            }

            #${WIDGET_ID} .sb-messages-area::-webkit-scrollbar-track {
                background: #f0f0f0;
                border-radius: 10px;
            }

            #${WIDGET_ID} .sb-messages-area::-webkit-scrollbar-thumb {
                background: var(--sb-primary);
                border-radius: 10px;
            }

            #${WIDGET_ID} .sb-message-item {
                display: flex;
                gap: 12px;
                margin-bottom: 15px;
                animation: fadeIn 0.3s ease;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            #${WIDGET_ID} .sb-message-item.sb-user {
                justify-content: flex-end;
            }

            #${WIDGET_ID} .sb-avatar {
                font-size: 24px;
                flex-shrink: 0;
            }

            #${WIDGET_ID} .sb-text {
                max-width: 70%;
                padding: 12px 16px;
                border-radius: 12px;
                line-height: 1.6;
                word-break: break-word;
            }

            #${WIDGET_ID} .sb-assistant .sb-text {
                background: #f0f0f0;
                color: #333;
            }

            #${WIDGET_ID} .sb-user .sb-text {
                background: var(--sb-primary);
                color: white;
                border-bottom-right-radius: 2px;
            }

            #${WIDGET_ID} .sb-loading::after {
                content: "";
                display: inline-block;
                width: 1em;
                animation: dots 1s steps(4, end) infinite;
            }

            @keyframes dots {
                0%, 20% { content: ""; }
                40% { content: "."; }
                60% { content: ".."; }
                80%, 100% { content: "..."; }
            }

            #${WIDGET_ID} .sb-help-list {
                margin: 10px 0;
                padding-left: 20px;
                list-style: none;
            }

            #${WIDGET_ID} .sb-help-list li {
                margin: 5px 0;
                padding-left: 20px;
                position: relative;
            }

            #${WIDGET_ID} .sb-suggestions {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 10px;
                margin-bottom: 15px;
            }

            #${WIDGET_ID} .sb-suggestion-btn {
                padding: 10px 15px;
                border: 2px solid var(--sb-primary);
                background: white;
                color: var(--sb-primary);
                border-radius: 10px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.2s;
                font-size: 13px;
            }

            #${WIDGET_ID} .sb-suggestion-btn:hover {
                background: var(--sb-primary);
                color: white;
                transform: translateY(-2px);
            }

            #${WIDGET_ID} .sb-input-area {
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 10px;
                align-items: flex-end;
            }

            #${WIDGET_ID} .sb-input-field {
                border: 2px solid #ddd;
                border-radius: 10px;
                padding: 12px;
                font-family: inherit;
                font-size: 14px;
                resize: none;
                transition: border-color 0.2s;
            }

            #${WIDGET_ID} .sb-input-field:focus {
                outline: none;
                border-color: var(--sb-primary);
            }

            #${WIDGET_ID} .sb-send-btn {
                background: linear-gradient(135deg, var(--sb-primary), #14b8a6);
                color: white;
                border: 0;
                padding: 12px 30px;
                border-radius: 10px;
                cursor: pointer;
                font-weight: 700;
                transition: transform 0.1s;
            }

            #${WIDGET_ID} .sb-send-btn:active {
                transform: scale(0.95);
            }

            #${WIDGET_ID} .sb-footer {
                padding: 15px;
                border-top: 1px solid #eee;
                text-align: center;
            }

            #${WIDGET_ID} .sb-close-btn {
                background: #f0f0f0;
                border: 0;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                color: #666;
                transition: background 0.2s;
            }

            #${WIDGET_ID} .sb-close-btn:hover {
                background: #ddd;
            }

            @media (max-width: 768px) {
                #${WIDGET_ID} .sb-container {
                    width: 95vw;
                    height: 95vh;
                }
                
                #${WIDGET_ID} .sb-text {
                    max-width: 100%;
                }

                #${WIDGET_ID} .sb-suggestions {
                    grid-template-columns: 1fr;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function collectPageContent() {
        const clone = document.body.cloneNode(true);
        const widget = clone.querySelector(`#${WIDGET_ID}`);
        if (widget) widget.remove();
        clone.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
        return clone.textContent.replace(/\s+/g, " ").trim().slice(0, 5000);
    }

    // Wait for DOM and initialize
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
