(function () {
    "use strict";

    const WIDGET_ID = "supreme-boost-root";
    const STYLE_ID = "supreme-boost-style";
    const ADAPTIVE_STYLE_ID = "supreme-boost-adaptive-style";
    const DEFAULT_TITLE = "Supreme AI";
    const DEFAULT_GREETING = "สวัสดีครับ ผมช่วยตอบคำถามจากข้อมูลบนหน้านี้ได้เลย";
    const DEFAULT_PRIMARY = "#2563eb";
    const MAX_PAGE_CHARS = 6000;
    const MAX_HISTORY = 8;
    const PAGE_TEXT_CLASS = "supreme-boost-large-text";
    const PAGE_SMALL_TEXT_CLASS = "supreme-boost-small-text";

    if (window.__SUPREME_BOOST_READY__) {
        return;
    }
    window.__SUPREME_BOOST_READY__ = true;

    function ready(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
            return;
        }
        callback();
    }

    function getScriptTag() {
        return document.currentScript || document.querySelector('script[src*="boost.js"]');
    }

    function getConfig() {
        const script = getScriptTag();
        const scriptUrl = script && script.src ? new URL(script.src, document.baseURI) : null;
        const backendFromScript = scriptUrl && scriptUrl.origin !== "null"
            ? `${scriptUrl.origin}/api/chat`
            : "/api/chat";

        return {
            title: getAttr(script, "data-title", DEFAULT_TITLE),
            greeting: getAttr(script, "data-greeting", DEFAULT_GREETING),
            shopPrompt: getAttr(script, "data-shop-prompt", ""),
            backendUrl: getAttr(script, "data-backend-url", backendFromScript),
            primary: normalizeColor(getAttr(script, "data-primary", DEFAULT_PRIMARY)),
            position: getAttr(script, "data-position", "right").toLowerCase() === "left" ? "left" : "right",
            startOpen: getAttr(script, "data-open", "false") === "true"
        };
    }

    function getAttr(element, name, fallback) {
        if (!element) return fallback;
        const value = element.getAttribute(name);
        return value === null || value.trim() === "" ? fallback : value.trim();
    }

    function normalizeColor(value) {
        if (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgb(a)?\(/i.test(value) || /^hsl(a)?\(/i.test(value)) {
            return value;
        }
        return DEFAULT_PRIMARY;
    }

    function init() {
        if (!document.body || document.getElementById(WIDGET_ID)) return;

        const config = getConfig();
        injectStyle(config);

        const root = document.createElement("div");
        root.id = WIDGET_ID;
        root.className = `sb-root sb-${config.position}`;
        root.style.setProperty("--sb-primary", config.primary);

        const launcher = document.createElement("button");
        launcher.className = "sb-launcher";
        launcher.type = "button";
        launcher.setAttribute("aria-label", "เปิดแชท Supreme AI");
        launcher.innerHTML = "<span>AI</span>";

        const panel = document.createElement("section");
        panel.className = "sb-panel";
        panel.setAttribute("aria-label", "Supreme AI Chat");
        panel.setAttribute("aria-live", "polite");

        panel.innerHTML = [
            '<div class="sb-header">',
            '  <div>',
            '    <div class="sb-title"></div>',
            '    <div class="sb-subtitle">พร้อมตอบจากข้อมูลหน้าเว็บนี้</div>',
            "  </div>",
            '  <div class="sb-actions">',
            '    <button class="sb-icon-btn" type="button" data-action="theme" aria-label="สลับธีมหน้าเว็บ">◐</button>',
            '    <button class="sb-icon-btn" type="button" data-action="close" aria-label="ปิดแชท">×</button>',
            "  </div>",
            "</div>",
            '<div class="sb-messages"></div>',
            '<div class="sb-quick"></div>',
            '<form class="sb-compose">',
            '  <textarea class="sb-input" rows="1" placeholder="พิมพ์คำถาม..." aria-label="พิมพ์คำถาม"></textarea>',
            '  <button class="sb-send" type="submit" aria-label="ส่งข้อความ">ส่ง</button>',
            "</form>"
        ].join("");

        root.appendChild(panel);
        root.appendChild(launcher);
        document.body.appendChild(root);

        const title = panel.querySelector(".sb-title");
        const messages = panel.querySelector(".sb-messages");
        const quick = panel.querySelector(".sb-quick");
        const form = panel.querySelector(".sb-compose");
        const input = panel.querySelector(".sb-input");
        const closeButton = panel.querySelector('[data-action="close"]');
        const themeButton = panel.querySelector('[data-action="theme"]');
        const adaptiveStyle = ensureAdaptiveStyle();

        title.textContent = config.title;

        const state = {
            open: false,
            busy: false,
            selectedText: "",
            history: []
        };

        addMessage(messages, "assistant", config.greeting);
        renderQuickActions(quick, input, sendMessage);
        setOpen(config.startOpen);

        launcher.addEventListener("click", () => setOpen(!state.open));
        closeButton.addEventListener("click", () => setOpen(false));
        themeButton.addEventListener("click", togglePageTheme);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            sendMessage(input.value);
        });
        input.addEventListener("input", () => autoGrow(input));
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (typeof form.requestSubmit === "function") {
                    form.requestSubmit();
                } else {
                    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                }
            }
        });
        document.addEventListener("selectionchange", () => {
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : "";
            if (text.length > 20) {
                state.selectedText = text.slice(0, 1200);
            }
        });

        setTimeout(() => {
            if (!state.open) root.classList.add("sb-nudge");
        }, 4500);

        async function sendMessage(rawText) {
            const text = String(rawText || "").trim();
            if (!text || state.busy) return;
            const localAction = applyLocalPageCommand(text);

            setOpen(true);
            root.classList.remove("sb-nudge");
            input.value = "";
            autoGrow(input);

            state.busy = true;
            form.classList.add("sb-busy");
            addMessage(messages, "user", text);
            pushHistory(state, "user", text);
            const loading = addMessage(messages, "assistant", localAction ? `${localAction.reply}\nกำลังถาม AI เพิ่มเติม...` : "กำลังคิด...", true);

            try {
                const data = await askBackend(config, state, text);
                const reply = mergeLocalReply(localAction, data.reply || "");
                updateMessage(loading, reply || "ขออภัยครับ ระบบยังตอบไม่ได้ในตอนนี้");
                pushHistory(state, "assistant", reply || "");

                if (isSafeCss(data.cssCommand)) {
                    adaptiveStyle.textContent += `\n/* Supreme AI adaptive update */\n${data.cssCommand.trim()}\n`;
                }
            } catch (error) {
                console.error("Supreme Boost chat error:", error);
                const localReply = buildLocalContentReply(text);
                const errorReply = error && error.message && !/^HTTP\s/i.test(error.message)
                    ? error.message
                    : "เชื่อมต่อระบบ AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
                updateMessage(loading, localAction ? localAction.reply : (localReply || errorReply));
            } finally {
                state.busy = false;
                form.classList.remove("sb-busy");
                input.focus();
            }
        }

        function setOpen(open) {
            state.open = open;
            root.classList.toggle("sb-open", open);
            launcher.setAttribute("aria-expanded", String(open));
            if (open) {
                root.classList.remove("sb-nudge");
                setTimeout(() => input.focus(), 50);
            }
        }
    }

    function injectStyle(config) {
        if (document.getElementById(STYLE_ID)) return;

        const side = config.position === "left" ? "left" : "right";
        const opposite = side === "left" ? "right" : "left";
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${WIDGET_ID}, #${WIDGET_ID} * { box-sizing: border-box; }
            #${WIDGET_ID} {
                --sb-primary: ${config.primary};
                --sb-bg: #ffffff;
                --sb-text: #0f172a;
                --sb-muted: #64748b;
                --sb-border: #e2e8f0;
                position: fixed;
                ${side}: 20px;
                bottom: 20px;
                z-index: 2147483000;
                font-family: Arial, "Noto Sans Thai", sans-serif;
                color: var(--sb-text);
            }
            #${WIDGET_ID}.sb-${side} .sb-panel { ${side}: 0; ${opposite}: auto; }
            #${WIDGET_ID} .sb-panel {
                position: absolute;
                bottom: 68px;
                width: min(380px, calc(100vw - 32px));
                height: min(580px, calc(100vh - 108px));
                display: none;
                overflow: hidden;
                background: var(--sb-bg);
                border: 1px solid var(--sb-border);
                border-radius: 8px;
                box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
            }
            #${WIDGET_ID}.sb-open .sb-panel {
                display: flex;
                flex-direction: column;
            }
            #${WIDGET_ID} .sb-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 14px 14px 12px;
                color: #ffffff;
                background: linear-gradient(135deg, var(--sb-primary), #14b8a6);
            }
            #${WIDGET_ID} .sb-title {
                font-size: 16px;
                line-height: 1.2;
                font-weight: 700;
                letter-spacing: 0;
            }
            #${WIDGET_ID} .sb-subtitle {
                margin-top: 2px;
                font-size: 12px;
                line-height: 1.35;
                opacity: 0.88;
            }
            #${WIDGET_ID} .sb-actions {
                display: flex;
                gap: 6px;
                flex-shrink: 0;
            }
            #${WIDGET_ID} .sb-icon-btn {
                width: 32px;
                height: 32px;
                display: inline-grid;
                place-items: center;
                border: 1px solid rgba(255, 255, 255, 0.35);
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.16);
                color: #ffffff;
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
            }
            #${WIDGET_ID} .sb-messages {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 14px;
                overflow: auto;
                background: #f8fafc;
            }
            #${WIDGET_ID} .sb-msg {
                max-width: 88%;
                padding: 10px 12px;
                border-radius: 8px;
                font-size: 14px;
                line-height: 1.55;
                white-space: pre-wrap;
                word-break: break-word;
                overflow-wrap: anywhere;
            }
            #${WIDGET_ID} .sb-user {
                align-self: flex-end;
                color: #ffffff;
                background: var(--sb-primary);
            }
            #${WIDGET_ID} .sb-assistant {
                align-self: flex-start;
                color: var(--sb-text);
                background: #ffffff;
                border: 1px solid var(--sb-border);
            }
            #${WIDGET_ID} .sb-loading::after {
                content: "";
                display: inline-block;
                width: 1.1em;
                text-align: left;
                animation: sbDots 1s steps(4, end) infinite;
            }
            #${WIDGET_ID} .sb-quick {
                display: flex;
                gap: 8px;
                padding: 10px 12px;
                overflow-x: auto;
                border-top: 1px solid var(--sb-border);
                background: #ffffff;
            }
            #${WIDGET_ID} .sb-chip {
                flex: 0 0 auto;
                border: 1px solid var(--sb-border);
                border-radius: 999px;
                background: #ffffff;
                color: var(--sb-text);
                padding: 7px 10px;
                font-size: 12px;
                line-height: 1;
                cursor: pointer;
            }
            #${WIDGET_ID} .sb-compose {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 8px;
                align-items: end;
                padding: 12px;
                border-top: 1px solid var(--sb-border);
                background: #ffffff;
            }
            #${WIDGET_ID} .sb-input {
                min-height: 42px;
                max-height: 120px;
                resize: none;
                border: 1px solid var(--sb-border);
                border-radius: 8px;
                padding: 10px 11px;
                outline: none;
                color: var(--sb-text);
                background: #ffffff;
                font: inherit;
                font-size: 14px;
                line-height: 1.45;
            }
            #${WIDGET_ID} .sb-input:focus {
                border-color: var(--sb-primary);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--sb-primary) 18%, transparent);
            }
            #${WIDGET_ID} .sb-send {
                min-height: 42px;
                border: 0;
                border-radius: 8px;
                padding: 0 15px;
                color: #ffffff;
                background: var(--sb-primary);
                font-weight: 700;
                cursor: pointer;
            }
            #${WIDGET_ID} .sb-busy .sb-send {
                opacity: 0.65;
                cursor: wait;
            }
            #${WIDGET_ID} .sb-launcher {
                width: 56px;
                height: 56px;
                display: grid;
                place-items: center;
                margin-${side}: auto;
                border: 0;
                border-radius: 999px;
                color: #ffffff;
                background: linear-gradient(135deg, var(--sb-primary), #14b8a6);
                box-shadow: 0 16px 34px rgba(37, 99, 235, 0.34);
                cursor: pointer;
                font-weight: 800;
                letter-spacing: 0;
            }
            #${WIDGET_ID}.sb-open .sb-launcher span { transform: scale(0.92); }
            #${WIDGET_ID}.sb-nudge .sb-launcher { animation: sbPulse 1.5s ease-in-out 2; }
            html.supreme-boost-dark-page body {
                background: #0f172a !important;
                color: #e5e7eb !important;
            }
            html.supreme-boost-large-text body > :not(#${WIDGET_ID}) {
                font-size: 118% !important;
                line-height: 1.75 !important;
            }
            html.supreme-boost-large-text body > :not(#${WIDGET_ID}) :where(h1, h2, h3, h4, h5, h6, p, li, a, label, button, input, textarea, select, td, th, span, small, strong, em) {
                font-size: 118% !important;
                line-height: 1.75 !important;
            }
            html.supreme-boost-small-text body > :not(#${WIDGET_ID}) {
                font-size: 94% !important;
            }
            html.supreme-boost-small-text body > :not(#${WIDGET_ID}) :where(h1, h2, h3, h4, h5, h6, p, li, a, label, button, input, textarea, select, td, th, span, small, strong, em) {
                font-size: 94% !important;
            }
            @keyframes sbPulse {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
            @keyframes sbDots {
                0% { content: ""; }
                25% { content: "."; }
                50% { content: ".."; }
                75%, 100% { content: "..."; }
            }
            @media (max-width: 520px) {
                #${WIDGET_ID} {
                    left: 12px;
                    right: 12px;
                    bottom: 12px;
                }
                #${WIDGET_ID} .sb-panel {
                    left: 0;
                    right: 0;
                    width: auto;
                    height: min(620px, calc(100vh - 92px));
                    bottom: 66px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureAdaptiveStyle() {
        let style = document.getElementById(ADAPTIVE_STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = ADAPTIVE_STYLE_ID;
            document.head.appendChild(style);
        }
        return style;
    }

    function renderQuickActions(container, input, onPick) {
        const items = [
            "มีสินค้าอะไรบ้าง",
            "ราคาเท่าไหร่",
            "มีโปรโมชันไหม",
            "ช่วยทำหน้าให้อ่านง่ายขึ้น"
        ];

        items.forEach((label) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "sb-chip";
            button.textContent = label;
            button.addEventListener("click", () => {
                input.value = label;
                onPick(label);
            });
            container.appendChild(button);
        });
    }

    function addMessage(container, role, text, loading) {
        const message = document.createElement("div");
        message.className = `sb-msg sb-${role}${loading ? " sb-loading" : ""}`;
        message.textContent = text;
        container.appendChild(message);
        container.scrollTop = container.scrollHeight;
        return message;
    }

    function updateMessage(message, text) {
        message.classList.remove("sb-loading");
        message.textContent = text;
        const scroller = message.parentElement;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }

    function pushHistory(state, role, text) {
        if (!text) return;
        state.history.push({ role, text: String(text).slice(0, 1200) });
        if (state.history.length > MAX_HISTORY) {
            state.history.splice(0, state.history.length - MAX_HISTORY);
        }
    }

    function autoGrow(input) {
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    }

    function togglePageTheme() {
        document.documentElement.classList.toggle("supreme-boost-dark-page");
    }

    function applyLocalPageCommand(text) {
        const value = String(text || "").toLowerCase();
        const html = document.documentElement;

        if (/(reset|รีเซ็ต|คืนค่า|กลับปกติ|ขนาดปกติ|ตัวอักษรปกติ)/i.test(value)) {
            html.classList.remove(PAGE_TEXT_CLASS, PAGE_SMALL_TEXT_CLASS, "supreme-boost-dark-page");
            return { type: "reset", reply: "ปรับหน้าเว็บกลับเป็นค่าเดิมให้แล้วครับ" };
        }

        if (/(ขยาย|ตัวใหญ่|ใหญ่ขึ้น|เพิ่มขนาด|อ่านง่าย|อ่านชัด|font\s*size|bigger|large|zoom in)/i.test(value)) {
            html.classList.add(PAGE_TEXT_CLASS);
            html.classList.remove(PAGE_SMALL_TEXT_CLASS);
            return { type: "large-text", reply: "ขยายตัวอักษรบนหน้าเว็บให้แล้วครับ" };
        }

        if (/(ลดขนาด|ตัวเล็ก|เล็กลง|ย่อ|smaller|small|zoom out)/i.test(value)) {
            html.classList.add(PAGE_SMALL_TEXT_CLASS);
            html.classList.remove(PAGE_TEXT_CLASS);
            return { type: "small-text", reply: "ลดขนาดตัวอักษรบนหน้าเว็บให้แล้วครับ" };
        }

        if (/(ธีมเข้ม|โหมดมืด|สีเข้ม|dark mode|dark theme)/i.test(value)) {
            html.classList.add("supreme-boost-dark-page");
            return { type: "dark", reply: "เปิดธีมเข้มให้แล้วครับ" };
        }

        if (/(ธีมสว่าง|โหมดสว่าง|สีสว่าง|light mode|light theme)/i.test(value)) {
            html.classList.remove("supreme-boost-dark-page");
            return { type: "light", reply: "เปลี่ยนกลับเป็นธีมสว่างให้แล้วครับ" };
        }

        return null;
    }

    function mergeLocalReply(localAction, aiReply) {
        const reply = String(aiReply || "").trim();
        if (!localAction) return reply;
        if (!reply) return localAction.reply;

        const alreadyConfirmed = /(ปรับ|ขยาย|ลด|เปิด|เปลี่ยน|เรียบร้อย|done|updated)/i.test(reply);
        return alreadyConfirmed ? reply : `${localAction.reply}\n\n${reply}`;
    }

    async function askBackend(config, state, prompt) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch(config.backendUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    shopPrompt: config.shopPrompt,
                    pageContent: collectPageContent(),
                    selectedText: state.selectedText,
                    history: state.history.slice(-MAX_HISTORY),
                    url: location.href,
                    title: document.title
                }),
                signal: controller.signal
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            return {
                reply: typeof data.reply === "string" ? data.reply : "",
                cssCommand: typeof data.cssCommand === "string" ? data.cssCommand : ""
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    function buildLocalContentReply(prompt) {
        const question = String(prompt || "").toLowerCase();
        const pageContent = collectPageContent();

        if (!pageContent) return "";
        if (!/(สินค้า|มีอะไร|แบบ|เสื้อ|กางเกง|หมวก|ราคา|โปร|promotion|product|price)/i.test(question)) {
            return "";
        }

        const chunks = extractContentChunks(pageContent);

        const keywords = question
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter((word) => word.length > 1);

        const matched = chunks
            .filter((chunk) => keywords.some((word) => chunk.toLowerCase().includes(word)))
            .slice(0, 5);

        const productLike = chunks
            .filter((chunk) => /(บาท|ราคา|เสื้อ|กางเกง|หมวก|สินค้า|โปรโมชัน|ส่งฟรี)/i.test(chunk))
            .slice(0, 5);

        const lines = matched.length ? matched : productLike;
        if (!lines.length) return "";

        return `ตอนนี้ระบบ AI หลักเชื่อมต่อไม่ได้ชั่วคราว แต่ผมอ่านข้อมูลบนหน้านี้ให้ได้ครับ:\n\n${lines.map((line) => `- ${line}`).join("\n")}`;
    }

    function extractContentChunks(content) {
        const source = String(content || "");
        const chunks = [];
        const pattern = /(เสื้อ|กางเกง|หมวก|สินค้า|ราคา|โปรโมชัน|ส่งฟรี|บาท)/gi;
        let match;

        while ((match = pattern.exec(source)) !== null && chunks.length < 16) {
            const start = Math.max(0, match.index - 24);
            const end = Math.min(source.length, match.index + 170);
            const chunk = source.slice(start, end).replace(/\s+/g, " ").trim();
            if (chunk.length > 8 && !chunks.some((item) => item.includes(chunk) || chunk.includes(item))) {
                chunks.push(chunk);
            }
        }

        return chunks;
    }

    function collectPageContent() {
        const clone = document.body.cloneNode(true);
        const widget = clone.querySelector(`#${WIDGET_ID}`);
        if (widget) widget.remove();
        clone.querySelectorAll("script, style, noscript, svg").forEach((node) => node.remove());
        return clone.textContent.replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_CHARS);
    }

    function isSafeCss(css) {
        if (!css || typeof css !== "string") return false;
        const trimmed = css.trim();
        if (!trimmed) return false;
        if (trimmed.length > 5000) return false;
        return !/(<|>|@import|url\s*\(|javascript:|expression\s*\()/i.test(trimmed);
    }

    ready(init);
})();
