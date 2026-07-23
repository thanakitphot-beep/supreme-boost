export function init(app, _clientApiKey, shopPrompt = "", backendUrl = "", options = {}) {
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
            /* Loading dots animation */
            #supreme-plugin-chat .sp-loading-dots {
                display: inline-flex;
                gap: 4px;
                align-items: center;
                padding: 4px 0;
            }
            #supreme-plugin-chat .sp-loading-dots span {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #94a3b8;
                animation: sp-bounce 1.2s ease-in-out infinite;
            }
            #supreme-plugin-chat .sp-loading-dots span:nth-child(1) { animation-delay: 0s; }
            #supreme-plugin-chat .sp-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
            #supreme-plugin-chat .sp-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
            @keyframes sp-bounce {
                0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                30% { transform: translateY(-5px); opacity: 1; }
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
            #supreme-plugin-chat .sp-send:disabled { opacity: 0.5; cursor: not-allowed; }
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
            html.supreme-plugin-large-text body > :not(#supreme-plugin-chat) {
                font-size: 118% !important;
                line-height: 1.75 !important;
            }
            html.supreme-plugin-large-text body > :not(#supreme-plugin-chat) :where(h1, h2, h3, h4, h5, h6, p, li, a, label, button, input, textarea, select, td, th, span, small, strong, em) {
                font-size: 118% !important;
                line-height: 1.75 !important;
            }
            html.supreme-plugin-small-text body > :not(#supreme-plugin-chat) {
                font-size: 94% !important;
            }
            html.supreme-plugin-small-text body > :not(#supreme-plugin-chat) :where(h1, h2, h3, h4, h5, h6, p, li, a, label, button, input, textarea, select, td, th, span, small, strong, em) {
                font-size: 94% !important;
            }
        </style>
        <section class="sp-panel" aria-label="INDICATOR WEB CHAT">
            <div class="sp-header">
                <span>INDICATOR WEB CHAT</span>
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
    const sendBtn = root.querySelector(".sp-send");
    const launch = root.querySelector(".sp-launch");
    const close = root.querySelector(".sp-close");
    const adaptiveStyle = document.createElement("style");
    adaptiveStyle.id = "supreme-plugin-adaptive-style";
    document.head.appendChild(adaptiveStyle);

    // ✅ FIX 1: Conversation history buffer (max 8 rounds)
    const MAX_HISTORY = 8;
    const conversationHistory = [];

    addMessage(messages, "ai", "สวัสดีครับ สอบถามข้อมูลบนหน้าเว็บนี้ได้เลย");

    launch.addEventListener("click", () => setOpen(true));
    close.addEventListener("click", () => setOpen(false));
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const text = input.value.trim();
        if (!text) return;
        const localAction = applyLocalPageCommand(text);

        input.value = "";
        input.disabled = true;
        sendBtn.disabled = true;

        addMessage(messages, "user", text);
        // ✅ FIX 11: Loading dots animation
        const loading = addLoadingMessage(messages, localAction ? localAction.reply : null);

        const aiData = await askThroughBackend(apiUrl, text, shopPrompt, conversationHistory);
        loading.innerHTML = "";
        loading.textContent = mergeLocalReply(localAction, aiData.reply);

        // ✅ NANOMETER UPGRADE: Execute AI Action autonomously
        if (aiData.action) {
            executeAiAction(aiData.action);
        }

        // ✅ FIX 1: Update conversation history
        conversationHistory.push({ role: "user", text: text });
        conversationHistory.push({ role: "assistant", text: aiData.reply || "" });
        if (conversationHistory.length > MAX_HISTORY * 2) {
            conversationHistory.splice(0, 2); // remove oldest pair
        }

        // ✅ FIX 2: CSS memory leak — replace instead of append
        if (isSafeCss(aiData.cssCommand)) {
            adaptiveStyle.textContent = `/* INDICATOR WEB CHAT adaptive style */\n${aiData.cssCommand.trim()}`;
        }

        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
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
    // ✅ FIX: Use origin-relative path — works on Vercel Serverless + localhost
    return (typeof window !== "undefined" && window.location && window.location.origin
        ? window.location.origin
        : "") + "/api/chat";
}

async function askThroughBackend(apiUrl, prompt, shopPrompt, history = []) {
    try {
        const locale = (document.documentElement.lang || navigator.language || "th").split("-")[0].toLowerCase();
        
        // 🔍 SMART PRODUCT MAP: scan page for all clickable product-like elements
        const productMap = [];
        const selectors = [
            '[class*="product"]', '[class*="item"]', '[class*="card"]',
            '[class*="service"]', '[class*="package"]', '[class*="plan"]',
            '[data-product]', 'article', '.product', '.item', '.card'
        ];
        const seen = new Set();
        for (const sel of selectors) {
            try {
                document.querySelectorAll(sel).forEach(el => {
                    if (seen.has(el)) return;
                    seen.add(el);
                    const text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
                    const link = el.querySelector('a')?.href || el.closest('a')?.href || null;
                    const img = el.querySelector('img')?.src || null;
                    const title = (el.querySelector('h1,h2,h3,h4,h5,strong')?.textContent || '').trim().slice(0, 80);
                    if (text.length > 20) {
                        productMap.push({ selector: sel, title, text, link, img });
                    }
                });
            } catch(e) {}
        }

        // Also capture all visible links with descriptive text
        const links = Array.from(document.querySelectorAll('a[href]'))
            .filter(a => a.textContent.trim().length > 3 && !a.href.startsWith('javascript'))
            .slice(0, 30)
            .map(a => ({ text: a.textContent.trim(), href: a.href }));

        const siteDNA = {
            title: document.title,
            lang: document.documentElement.lang || "th",
            headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 8).map(h => h.textContent.trim()).filter(Boolean),
            productMap: productMap.slice(0, 20),
            links: links.slice(0, 20)
        };
        const selectedText = window.getSelection ? window.getSelection().toString().trim().slice(0, 500) : "";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt,
                locale,
                history,
                siteDNA,
                selectedText,
                pageContent: document.body.textContent.replace(/\s+/g, " ").trim().slice(0, 6000),
                title: document.title,
                url: location.href
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { reply: data.error || "ระบบตอบกลับไม่สำเร็จ", cssCommand: "", action: null };
        }
        return {
            reply: typeof data.reply === "string" ? data.reply : "ขออภัยครับ ระบบยังตอบไม่ได้ในตอนนี้",
            cssCommand: typeof data.cssCommand === "string" ? data.cssCommand : "",
            action: data.action || null,
            interactive: data.interactive || null
        };
    } catch (error) {
        console.error("Backend connection error:", error);
        return { reply: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง", cssCommand: "", action: null };
    }
}


// ✅ NANOMETER UPGRADE: Autonomous Action Executor
function executeAiAction(action) {
    if (!action || typeof action !== "object") return;
    try {
        switch (action.type) {
            case "redirect":
            case "warp_cross_page":
                if (action.url) {
                    console.log("[AI Action] Redirecting to:", action.url);
                    window.location.href = action.url;
                }
                break;
            case "translate":
                if (action.lang) {
                    console.log("[AI Action] Translating to:", action.lang);
                    // Google Translate fallback
                    window.location.href = `https://translate.google.com/translate?sl=auto&tl=${action.lang}&u=${encodeURIComponent(window.location.href)}`;
                }
                break;
            case "highlight":
                if (action.selector) {
                    smartHighlight(action.selector, action.keyword || null);
                }
                break;
            case "smart_find":
                // 🔍 AI tells us a keyword/product name to find and highlight on page
                if (action.keyword) {
                    const found = smartFindAndHighlight(action.keyword, action.scrollTo !== false);
                    if (!found) console.warn("[AI Action] Could not find element for keyword:", action.keyword);
                }
                break;
            case "confetti":
                console.log("[AI Action] 🎉 Confetti time!");
                // Simple DOM confetti since we don't have a library guaranteed
                for(let i=0; i<30; i++) {
                    let c = document.createElement("div");
                    c.style.position = "fixed";
                    c.style.width = "10px";
                    c.style.height = "10px";
                    c.style.backgroundColor = ["#f00","#0f0","#00f","#ff0","#0ff"][Math.floor(Math.random()*5)];
                    c.style.left = Math.random() * 100 + "vw";
                    c.style.top = "-10px";
                    c.style.zIndex = "999999";
                    c.style.transition = "transform 2s ease-in, top 2s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
                    document.body.appendChild(c);
                    setTimeout(() => { c.style.top = "100vh"; c.style.transform = `rotate(${Math.random()*360}deg)`; }, 50);
                    setTimeout(() => c.remove(), 2000);
                }
                break;
            case "click":
                if (action.selector) {
                    console.log("[AI Action] Clicking element:", action.selector);
                    const target = document.querySelector(action.selector);
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => target.click(), 500); // delay click slightly for UX
                    } else {
                        console.warn("[AI Action] Click target not found:", action.selector);
                    }
                }
                break;
            case "inject_html":
                if (action.html) {
                    console.log("[AI Action] Injecting HTML (Admin Mode)");
                    if (action.containerSelector) {
                        const container = document.querySelector(action.containerSelector);
                        if (container) container.innerHTML = action.html;
                    } else {
                        // Default to Overlay Modal if no container specified
                        const overlay = document.createElement("div");
                        overlay.style.position = "fixed";
                        overlay.style.top = "0";
                        overlay.style.left = "0";
                        overlay.style.width = "100vw";
                        overlay.style.height = "100vh";
                        overlay.style.backgroundColor = "rgba(0,0,0,0.6)";
                        overlay.style.zIndex = "9999999";
                        overlay.style.display = "flex";
                        overlay.style.justifyContent = "center";
                        overlay.style.alignItems = "center";
                        
                        const content = document.createElement("div");
                        content.style.backgroundColor = "#fff";
                        content.style.padding = "20px";
                        content.style.borderRadius = "12px";
                        content.style.maxWidth = "80%";
                        content.style.maxHeight = "80%";
                        content.style.overflow = "auto";
                        content.innerHTML = action.html;
                        
                        // Add close button
                        const closeBtn = document.createElement("button");
                        closeBtn.textContent = "ปิด (Close)";
                        closeBtn.style.display = "block";
                        closeBtn.style.marginTop = "15px";
                        closeBtn.style.padding = "8px 16px";
                        closeBtn.style.background = "#ef4444";
                        closeBtn.style.color = "white";
                        closeBtn.style.border = "none";
                        closeBtn.style.borderRadius = "6px";
                        closeBtn.style.cursor = "pointer";
                        closeBtn.onclick = () => overlay.remove();
                        
                        content.appendChild(closeBtn);
                        overlay.appendChild(content);
                        document.body.appendChild(overlay);
                    }
                }
                break;
        }
    } catch (e) {
        console.error("AI Action execution failed:", e);
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

// ✅ FIX 11: Animated loading dots bubble
function addLoadingMessage(container, localReply) {
    const item = document.createElement("div");
    item.className = "sp-msg sp-ai";
    if (localReply) {
        item.textContent = localReply + "\n";
    }
    const dots = document.createElement("span");
    dots.className = "sp-loading-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";
    item.appendChild(dots);
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
    return item;
}

function applyLocalPageCommand(text) {
    const value = String(text || "").toLowerCase();
    const html = document.documentElement;

    if (/(reset|รีเซ็ต|คืนค่า|กลับปกติ|ขนาดปกติ|ตัวอักษรปกติ)/i.test(value)) {
        html.classList.remove("supreme-plugin-large-text", "supreme-plugin-small-text");
        return { reply: "ปรับหน้าเว็บกลับเป็นค่าเดิมให้แล้วครับ" };
    }

    if (/(ขยาย|ตัวใหญ่|ใหญ่ขึ้น|เพิ่มขนาด|อ่านง่าย|อ่านชัด|font\s*size|bigger|large|zoom in)/i.test(value)) {
        html.classList.add("supreme-plugin-large-text");
        html.classList.remove("supreme-plugin-small-text");
        return { reply: "ขยายตัวอักษรบนหน้าเว็บให้แล้วครับ" };
    }

    if (/(ลดขนาด|ตัวเล็ก|เล็กลง|ย่อ|smaller|small|zoom out)/i.test(value)) {
        html.classList.add("supreme-plugin-small-text");
        html.classList.remove("supreme-plugin-large-text");
        return { reply: "ลดขนาดตัวอักษรบนหน้าเว็บให้แล้วครับ" };
    }

    return null;
}

function mergeLocalReply(localAction, aiReply) {
    const reply = String(aiReply || "").trim();
    if (!localAction) return reply || "ขออภัยครับ ระบบยังตอบไม่ได้ในตอนนี้";
    if (!reply) return localAction.reply;

    const alreadyConfirmed = /(ปรับ|ขยาย|ลด|เรียบร้อย|done|updated)/i.test(reply);
    return alreadyConfirmed ? reply : `${localAction.reply}\n\n${reply}`;
}

// 🔍 Smart Highlight by CSS Selector (with animated glowing border)
function smartHighlight(selector, keyword = null) {
    try {
        const el = selector ? document.querySelector(selector) : null;
        const target = el || (keyword ? _fuzzyFind(keyword) : null);
        if (!target) return false;
        _doHighlight(target);
        return true;
    } catch(e) { return false; }
}

// 🔍 Smart Find & Highlight by keyword — fuzzy text matching across whole page
function smartFindAndHighlight(keyword, scroll = true) {
    const el = _fuzzyFind(keyword);
    if (!el) return false;
    _doHighlight(el, scroll);
    return true;
}

// Internal: fuzzy keyword search across product-like elements, then headings, then all text
function _fuzzyFind(keyword) {
    const kw = keyword.toLowerCase().trim();
    const productSelectors = [
        '[class*="product"]', '[class*="item"]', '[class*="card"]',
        '[class*="service"]', '[class*="package"]', '[class*="plan"]',
        'article', 'li', 'section'
    ];

    // 1st pass: prioritize product/card containers
    for (const sel of productSelectors) {
        const els = Array.from(document.querySelectorAll(sel));
        const match = els.find(el => el.textContent.toLowerCase().includes(kw));
        if (match) return match;
    }

    // 2nd pass: headings
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5'));
    const hMatch = headings.find(h => h.textContent.toLowerCase().includes(kw));
    if (hMatch) return hMatch;

    // 3rd pass: any element with direct text match
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
        if (node.id === 'supreme-plugin-chat') { walker.nextNode(); continue; }
        const tag = node.tagName.toLowerCase();
        if (['script','style','noscript','iframe'].includes(tag)) continue;
        if (node.children.length === 0 && node.textContent.toLowerCase().includes(kw)) {
            return node.parentElement || node;
        }
    }
    return null;
}

// Internal: animate highlight with glowing border + scroll
function _doHighlight(el, scroll = true) {
    // Remove any existing highlight
    document.querySelectorAll('.__sp-hl').forEach(e => {
        e.style.outline = e.dataset.oldOutline || '';
        e.style.boxShadow = e.dataset.oldShadow || '';
        e.style.transition = '';
        e.classList.remove('__sp-hl');
    });

    if (!el) return;
    el.dataset.oldOutline = el.style.outline || '';
    el.dataset.oldShadow = el.style.boxShadow || '';
    el.classList.add('__sp-hl');

    el.style.transition = 'outline 0.3s ease, box-shadow 0.3s ease';
    el.style.outline = '3px solid #2563eb';
    el.style.boxShadow = '0 0 0 6px rgba(37,99,235,0.2), 0 0 20px rgba(37,99,235,0.3)';

    if (scroll) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Pulse animation — 3 pulses then fade
    let pulse = 0;
    const interval = setInterval(() => {
        pulse++;
        el.style.boxShadow = pulse % 2 === 0
            ? '0 0 0 6px rgba(37,99,235,0.2), 0 0 20px rgba(37,99,235,0.3)'
            : '0 0 0 10px rgba(37,99,235,0.1), 0 0 30px rgba(37,99,235,0.5)';
        if (pulse >= 6) {
            clearInterval(interval);
            setTimeout(() => {
                el.style.outline = el.dataset.oldOutline || '';
                el.style.boxShadow = el.dataset.oldShadow || '';
                el.style.transition = '';
                el.classList.remove('__sp-hl');
            }, 500);
        }
    }, 400);
}

function isSafeCss(css) {
    if (!css || typeof css !== "string") return false;
    return !/(<|>|@import|url\s*\(|javascript:|expression\s*\()/i.test(css);
}
