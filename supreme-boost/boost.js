(function () {
    "use strict";

    // Capture current script immediately before any async execution
    // This is required because document.currentScript becomes null when the script is loaded with 'defer'
    const _currentScript = document.currentScript;

    console.debug("[Supreme Boost] script loaded");

    const WIDGET_ID = "supreme-boost-root";
    const STYLE_ID = "supreme-boost-style";
    const ADAPTIVE_STYLE_ID = "supreme-boost-adaptive-style";
    const DEFAULT_TITLE = "Supreme AI";
    const DEFAULT_PRIMARY = "#2563eb";
    const MAX_PAGE_CHARS = 6000;
    const MAX_HISTORY = 8;
    const PAGE_TEXT_CLASS = "supreme-boost-large-text";
    const PAGE_SMALL_TEXT_CLASS = "supreme-boost-small-text";
    const SUPPORTED_LOCALES = ["th", "en", "zh", "ja"];

    const I18N = {
        th: {
            subtitle: "พร้อมตอบจากข้อมูลหน้าเว็บนี้",
            placeholder: "พิมพ์คำถาม...",
            send: "ส่ง",
            openChat: "เปิดแชท Supreme AI",
            closeChat: "ปิดแชท",
            toggleTheme: "สลับธีมหน้าเว็บ",
            inputLabel: "พิมพ์คำถาม",
            thinking: "กำลังคิด...",
            askingMore: "กำลังถาม AI เพิ่มเติม...",
            noReply: "ขออภัยครับ ระบบยังตอบไม่ได้ในตอนนี้",
            connectError: "เชื่อมต่อระบบ AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
            greeting: "สวัสดีครับ ผมช่วยตอบคำถามจากข้อมูลบนหน้านี้ได้เลย",
            quick: ["มีสินค้าอะไรบ้าง", "ราคาเท่าไหร่", "มีโปรโมชันไหม", "ช่วยทำหน้าให้อ่านง่ายขึ้น"],
            reset: "ปรับหน้าเว็บกลับเป็นค่าเดิมให้แล้วครับ",
            largeText: "ขยายตัวอักษรบนหน้าเว็บให้แล้วครับ",
            smallText: "ลดขนาดตัวอักษรบนหน้าเว็บให้แล้วครับ",
            dark: "เปิดธีมเข้มให้แล้วครับ",
            light: "เปลี่ยนกลับเป็นธีมสว่างให้แล้วครับ",
            fallbackIntro: "ตอนนี้ระบบ AI หลักเชื่อมต่อไม่ได้ชั่วคราว แต่ผมอ่านข้อมูลบนหน้านี้ให้ได้ครับ:"
        },
        en: {
            subtitle: "Answers from this page",
            placeholder: "Type a question...",
            send: "Send",
            openChat: "Open Supreme AI chat",
            closeChat: "Close chat",
            toggleTheme: "Toggle page theme",
            inputLabel: "Type a question",
            thinking: "Thinking...",
            askingMore: "Asking AI for more details...",
            noReply: "Sorry, I could not generate a reply right now.",
            connectError: "Could not reach the AI server. Please try again.",
            greeting: "Hi! I can answer questions based on this page.",
            quick: ["What products do you have?", "How much does it cost?", "Any promotions?", "Make this page easier to read"],
            reset: "The page has been reset to default.",
            largeText: "Text on the page has been enlarged.",
            smallText: "Text on the page has been reduced.",
            dark: "Dark theme is now on.",
            light: "Light theme is now on.",
            fallbackIntro: "The main AI is temporarily unavailable, but I can read this page for you:"
        },
        zh: {
            subtitle: "根据本页内容回答",
            placeholder: "输入问题...",
            send: "发送",
            openChat: "打开 Supreme AI 聊天",
            closeChat: "关闭聊天",
            toggleTheme: "切换页面主题",
            inputLabel: "输入问题",
            thinking: "思考中...",
            askingMore: "正在向 AI 询问更多...",
            noReply: "抱歉，暂时无法回复。",
            connectError: "无法连接 AI 服务器，请稍后再试。",
            greeting: "你好！我可以根据本页内容回答问题。",
            quick: ["有哪些商品？", "价格多少？", "有促销吗？", "让页面更易阅读"],
            reset: "页面已恢复默认设置。",
            largeText: "已放大页面文字。",
            smallText: "已缩小页面文字。",
            dark: "已开启深色主题。",
            light: "已切换为浅色主题。",
            fallbackIntro: "主 AI 暂时不可用，但我可以读取本页信息："
        },
        ja: {
            subtitle: "このページの内容から回答します",
            placeholder: "質問を入力...",
            send: "送信",
            openChat: "Supreme AI チャットを開く",
            closeChat: "チャットを閉じる",
            toggleTheme: "ページテーマを切り替え",
            inputLabel: "質問を入力",
            thinking: "考え中...",
            askingMore: "AI に追加で確認中...",
            noReply: "申し訳ありません。現在返答できません。",
            connectError: "AI サーバーに接続できません。もう一度お試しください。",
            greeting: "こんにちは！このページの内容についてお答えできます。",
            quick: ["どんな商品がありますか？", "価格はいくらですか？", "プロモーションはありますか？", "ページを読みやすくして"],
            reset: "ページを元の設定に戻しました。",
            largeText: "ページの文字を大きくしました。",
            smallText: "ページの文字を小さくしました。",
            dark: "ダークテーマをオンにしました。",
            light: "ライトテーマに戻しました。",
            fallbackIntro: "メイン AI に一時的に接続できませんが、このページの情報は読み取れます："
        }
    };

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
        return _currentScript || document.querySelector('script[src*="boost.js"]');
    }

    function getConfig() {
        const script = getScriptTag();
        const scriptUrl = script && script.src ? new URL(script.src, document.baseURI) : null;
        const backendFromScript = scriptUrl && scriptUrl.origin !== "null"
            ? `${scriptUrl.origin}/api/chat`
            : "/api/chat";

        const langMode = getAttr(script, "data-lang", "auto").toLowerCase();

        return {
            title: getAttr(script, "data-title", DEFAULT_TITLE),
            greeting: getAttr(script, "data-greeting", ""),
            shopPrompt: getAttr(script, "data-shop-prompt", ""),
            backendUrl: getAttr(script, "data-backend-url", backendFromScript),
            primary: normalizeColor(getAttr(script, "data-primary", DEFAULT_PRIMARY)),
            position: getAttr(script, "data-position", "right").toLowerCase() === "left" ? "left" : "right",
            startOpen: getAttr(script, "data-open", "false") === "true",
            langMode: langMode === "auto" ? "auto" : normalizeLocale(langMode)
        };
    }

    function normalizeLocale(value) {
        const code = String(value || "").toLowerCase().split("-")[0];
        return SUPPORTED_LOCALES.includes(code) ? code : "en";
    }

    function detectBrowserLocale() {
        const htmlLang = document.documentElement.getAttribute("lang");
        if (htmlLang) return normalizeLocale(htmlLang);
        const nav = navigator.language || navigator.userLanguage || "en";
        return normalizeLocale(nav);
    }

    function detectTextLocale(text) {
        const sample = String(text || "");
        if (!sample.trim()) return null;

        const thai = (sample.match(/[\u0E00-\u0E7F]/g) || []).length;
        const kana = (sample.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
        const cjk = (sample.match(/[\u4E00-\u9FFF]/g) || []).length;
        const latin = (sample.match(/[a-zA-Z]/g) || []).length;
        const total = thai + kana + cjk + latin;

        if (total === 0) return null;
        if (thai >= Math.max(2, total * 0.15)) return "th";
        if (kana > 0) return "ja";
        if (cjk >= Math.max(2, total * 0.15)) return "zh";
        if (latin > 0) return "en";
        return null;
    }

    function resolveInitialLocale(config) {
        if (config.langMode !== "auto") return config.langMode;
        return detectBrowserLocale();
    }

    function resolveReplyLocale(config, state, text) {
        const fromText = detectTextLocale(text);
        if (fromText) return fromText;
        if (config.langMode !== "auto") return config.langMode;
        return state.locale;
    }

    function t(locale, key) {
        const pack = I18N[normalizeLocale(locale)] || I18N.en;
        return key ? pack[key] : pack;
    }

    function getGreeting(config, locale) {
        if (config.greeting) return config.greeting;
        return t(locale, "greeting");
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
        launcher.innerHTML = "<span>AI</span>";

        const panel = document.createElement("section");
        panel.className = "sb-panel";
        panel.setAttribute("aria-live", "polite");

        panel.innerHTML = [
            '<div class="sb-header">',
            '  <div>',
            '    <div class="sb-title"></div>',
            '    <div class="sb-subtitle"></div>',
            "  </div>",
            '  <div class="sb-actions">',
            '    <button class="sb-icon-btn" type="button" data-action="theme">◐</button>',
            '    <button class="sb-icon-btn" type="button" data-action="close">×</button>',
            "  </div>",
            "</div>",
            '<div class="sb-messages"></div>',
            '<div class="sb-quick"></div>',
            '<form class="sb-compose">',
            '  <textarea class="sb-input" rows="1"></textarea>',
            '  <button class="sb-send" type="submit"></button>',
            "</form>"
        ].join("");

        root.appendChild(panel);
        root.appendChild(launcher);
        document.body.appendChild(root);

        const title = panel.querySelector(".sb-title");
        const subtitle = panel.querySelector(".sb-subtitle");
        const messages = panel.querySelector(".sb-messages");
        const quick = panel.querySelector(".sb-quick");
        const form = panel.querySelector(".sb-compose");
        const input = panel.querySelector(".sb-input");
        const sendButton = panel.querySelector(".sb-send");
        const closeButton = panel.querySelector('[data-action="close"]');
        const themeButton = panel.querySelector('[data-action="theme"]');
        const adaptiveStyle = ensureAdaptiveStyle();

        title.textContent = config.title;

        const state = {
            open: false,
            busy: false,
            selectedText: "",
            history: [],
            locale: resolveInitialLocale(config)
        };

        const ui = { subtitle, input, sendButton, closeButton, themeButton, launcher, quick, panel };

        applyLocaleUI(ui, state.locale, config);
        addMessage(messages, "assistant", getGreeting(config, state.locale));
        renderQuickActions(quick, input, sendMessage, state.locale);
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

            const replyLocale = resolveReplyLocale(config, state, text);
            if (config.langMode === "auto" && replyLocale !== state.locale) {
                state.locale = replyLocale;
                applyLocaleUI(ui, state.locale, config);
                renderQuickActions(quick, input, sendMessage, state.locale, true);
            }

            const localAction = applyLocalPageCommand(text, replyLocale);
            const strings = t(replyLocale);

            setOpen(true);
            root.classList.remove("sb-nudge");
            input.value = "";
            autoGrow(input);

            state.busy = true;
            form.classList.add("sb-busy");
            addMessage(messages, "user", text);
            pushHistory(state, "user", text);
            const loading = addMessage(
                messages,
                "assistant",
                localAction ? `${localAction.reply}\n${strings.askingMore}` : strings.thinking,
                true
            );

            try {
                const data = await askBackend(config, state, text, replyLocale);
                const reply = mergeLocalReply(localAction, data.reply || "");
                updateMessage(loading, reply || strings.noReply);
                pushHistory(state, "assistant", reply || "");

                if (isSafeCss(data.cssCommand)) {
                    adaptiveStyle.textContent += `\n/* Supreme AI adaptive update */\n${data.cssCommand.trim()}\n`;
                }
                if (data.action) {
                    executeAction(data.action);
                }
            } catch (error) {
                console.error("Supreme Boost chat error:", error);
                const localReply = buildLocalContentReply(text, replyLocale);
                const errorReply = error && error.message && !/^HTTP\s/i.test(error.message)
                    ? error.message
                    : strings.connectError;
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
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.5);
                border-radius: 16px;
                box-shadow: 0 30px 80px rgba(15, 23, 42, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
                transform: translateY(20px) scale(0.95);
                opacity: 0;
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease;
                pointer-events: none;
            }
            #${WIDGET_ID}.sb-open .sb-panel {
                display: flex;
                flex-direction: column;
                transform: translateY(0) scale(1);
                opacity: 1;
                pointer-events: auto;
            }
            #${WIDGET_ID} .sb-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 16px 16px 14px;
                color: #ffffff;
                background: linear-gradient(135deg, rgba(37,99,235,0.95), rgba(20,184,166,0.95));
                backdrop-filter: blur(10px);
                border-bottom: 1px solid rgba(255,255,255,0.1);
                border-radius: 16px 16px 0 0;
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
                gap: 12px;
                padding: 16px;
                overflow: auto;
                background: transparent;
            }
            #${WIDGET_ID} .sb-msg {
                max-width: 88%;
                padding: 12px 16px;
                border-radius: 16px;
                font-size: 14.5px;
                line-height: 1.6;
                white-space: pre-wrap;
                word-break: break-word;
                overflow-wrap: anywhere;
                animation: sbFadeInUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                box-shadow: 0 4px 15px rgba(0,0,0,0.03);
            }
            #${WIDGET_ID} .sb-user {
                align-self: flex-end;
                color: #ffffff;
                background: linear-gradient(135deg, var(--sb-primary), #3b82f6);
                border-bottom-right-radius: 4px;
                box-shadow: 0 4px 15px color-mix(in srgb, var(--sb-primary) 30%, transparent);
            }
            #${WIDGET_ID} .sb-assistant {
                align-self: flex-start;
                color: var(--sb-text);
                background: rgba(255,255,255,0.9);
                border: 1px solid rgba(255,255,255,0.5);
                border-bottom-left-radius: 4px;
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
                border-top: 1px solid rgba(0,0,0,0.04);
                background: rgba(255,255,255,0.4);
                backdrop-filter: blur(10px);
            }
            #${WIDGET_ID} .sb-chip {
                flex: 0 0 auto;
                border: 1px solid rgba(0,0,0,0.08);
                border-radius: 999px;
                background: rgba(255,255,255,0.8);
                color: var(--sb-text);
                padding: 8px 12px;
                font-size: 13px;
                line-height: 1;
                cursor: pointer;
            }
            #${WIDGET_ID} .sb-compose {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 8px;
                align-items: end;
                padding: 14px;
                border-top: 1px solid rgba(0,0,0,0.04);
                background: rgba(255,255,255,0.6);
                backdrop-filter: blur(20px);
                border-radius: 0 0 16px 16px;
            }
            #${WIDGET_ID} .sb-input {
                min-height: 44px;
                max-height: 120px;
                resize: none;
                border: 1px solid rgba(0,0,0,0.1);
                border-radius: 12px;
                padding: 12px 14px;
                outline: none;
                color: var(--sb-text);
                background: rgba(255,255,255,0.9);
                font: inherit;
                font-size: 14.5px;
                line-height: 1.45;
                box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
                transition: all 0.2s ease;
            }
            #${WIDGET_ID} .sb-input:focus {
                border-color: var(--sb-primary);
                background: #ffffff;
                box-shadow: inset 0 2px 4px rgba(0,0,0,0.02), 0 0 0 3px color-mix(in srgb, var(--sb-primary) 18%, transparent);
            }
            #${WIDGET_ID} .sb-send {
                min-height: 44px;
                border: 0;
                border-radius: 12px;
                padding: 0 16px;
                color: #ffffff;
                background: linear-gradient(135deg, var(--sb-primary), #3b82f6);
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 4px 12px color-mix(in srgb, var(--sb-primary) 30%, transparent);
                transition: transform 0.1s;
            }
            #${WIDGET_ID} .sb-send:active { transform: scale(0.95); }
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
                box-shadow: 0 16px 34px color-mix(in srgb, var(--sb-primary) 40%, transparent), inset 0 0 0 1px rgba(255,255,255,0.2);
                cursor: pointer;
                font-weight: 800;
                letter-spacing: 0;
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            #${WIDGET_ID}.sb-open .sb-launcher { transform: scale(0.85); }
            #${WIDGET_ID}.sb-open .sb-launcher span { transform: rotate(90deg); opacity: 0; transition: all 0.3s; }
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
                0%, 100% { transform: translateY(0) scale(1); }
                50% { transform: translateY(-5px) scale(1.05); }
            }
            @keyframes sbFadeInUp {
                from { opacity: 0; transform: translateY(10px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
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

    function applyLocaleUI(ui, locale, config) {
        const strings = t(locale);
        ui.subtitle.textContent = strings.subtitle;
        ui.input.placeholder = strings.placeholder;
        ui.input.setAttribute("aria-label", strings.inputLabel);
        ui.sendButton.textContent = strings.send;
        ui.sendButton.setAttribute("aria-label", strings.send);
        ui.closeButton.setAttribute("aria-label", strings.closeChat);
        ui.themeButton.setAttribute("aria-label", strings.toggleTheme);
        ui.launcher.setAttribute("aria-label", strings.openChat);
        ui.panel.setAttribute("aria-label", config.title || DEFAULT_TITLE);
    }

    function renderQuickActions(container, input, onPick, locale, replace) {
        if (replace) container.innerHTML = "";
        const items = t(locale, "quick");

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

    function applyLocalPageCommand(text, locale) {
        const value = String(text || "").toLowerCase();
        const html = document.documentElement;
        const strings = t(locale);

        if (/(reset|รีเซ็ต|คืนค่า|กลับปกติ|ขนาดปกติ|ตัวอักษรปกติ|恢复|重置|リセット|reset page)/i.test(value)) {
            html.classList.remove(PAGE_TEXT_CLASS, PAGE_SMALL_TEXT_CLASS, "supreme-boost-dark-page");
            return { type: "reset", reply: strings.reset };
        }

        if (/(ขยาย|ตัวใหญ่|ใหญ่ขึ้น|เพิ่มขนาด|อ่านง่าย|อ่านชัด|font\s*size|bigger|large|zoom in|放大|読みやす|文字を大き)/i.test(value)) {
            html.classList.add(PAGE_TEXT_CLASS);
            html.classList.remove(PAGE_SMALL_TEXT_CLASS);
            return { type: "large-text", reply: strings.largeText };
        }

        if (/(ลดขนาด|ตัวเล็ก|เล็กลง|ย่อ|smaller|small|zoom out|缩小|文字を小)/i.test(value)) {
            html.classList.add(PAGE_SMALL_TEXT_CLASS);
            html.classList.remove(PAGE_TEXT_CLASS);
            return { type: "small-text", reply: strings.smallText };
        }

        if (/(ธีมเข้ม|โหมดมืด|สีเข้ม|dark mode|dark theme|深色|ダーク)/i.test(value)) {
            html.classList.add("supreme-boost-dark-page");
            return { type: "dark", reply: strings.dark };
        }

        if (/(ธีมสว่าง|โหมดสว่าง|สีสว่าง|light mode|light theme|浅色|ライト)/i.test(value)) {
            html.classList.remove("supreme-boost-dark-page");
            return { type: "light", reply: strings.light };
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

    async function askBackend(config, state, prompt, locale) {
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
                    title: document.title,
                    locale: normalizeLocale(locale)
                }),
                signal: controller.signal
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            return {
                reply: typeof data.reply === "string" ? data.reply : "",
                cssCommand: typeof data.cssCommand === "string" ? data.cssCommand : "",
                action: data.action || null
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    function executeAction(action) {
        if (!action || !action.type) return;

        try {
            switch (action.type) {
                case "confetti":
                    loadScript("https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js", () => {
                        if (window.confetti) {
                            window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, zIndex: 2147483647 });
                        }
                    });
                    break;
                case "highlight":
                    if (action.selector) {
                        const el = document.querySelector(action.selector);
                        if (el) {
                            const original = el.style.outline;
                            const originalTransition = el.style.transition;
                            el.style.transition = "outline 0.3s ease";
                            el.style.outline = "4px solid #facc15";
                            el.style.outlineOffset = "4px";
                            setTimeout(() => {
                                el.style.outline = "4px solid transparent";
                                setTimeout(() => {
                                    el.style.outline = original;
                                    el.style.transition = originalTransition;
                                }, 300);
                            }, 1500);
                            el.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                    }
                    break;
                case "speech":
                    if (action.text && window.speechSynthesis) {
                        const utterance = new SpeechSynthesisUtterance(action.text);
                        const lang = detectBrowserLocale();
                        utterance.lang = lang === "th" ? "th-TH" : lang === "ja" ? "ja-JP" : lang === "zh" ? "zh-CN" : "en-US";
                        window.speechSynthesis.speak(utterance);
                    }
                    break;
                case "inject_html":
                    if (action.html && action.containerSelector) {
                        const container = document.querySelector(action.containerSelector);
                        if (container) {
                            container.insertAdjacentHTML('beforeend', action.html);
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error("Action execution error:", error);
        }
    }

    function loadScript(src, callback) {
        if (document.querySelector(`script[src="${src}"]`)) {
            if (callback) callback();
            return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.onload = callback;
        document.head.appendChild(script);
    }

    function buildLocalContentReply(prompt, locale) {
        const question = String(prompt || "").toLowerCase();
        const pageContent = collectPageContent();
        const strings = t(locale);

        if (!pageContent) return "";
        if (!/(สินค้า|มีอะไร|แบบ|เสื้อ|กางเกง|หมวก|ราคา|โปร|promotion|product|price|商品|価格|产品)/i.test(question)) {
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

        return `${strings.fallbackIntro}\n\n${lines.map((line) => `- ${line}`).join("\n")}`;
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
