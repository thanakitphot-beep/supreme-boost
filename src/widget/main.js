(function () {
    "use strict";
    var _cs = document.currentScript;
    console.log("[INDICATOR WEB CHAT] v6.0 — Triple-Brain Matrix + Layout Fortress ✓");

    var WIDGET_ID = "supreme-boost-root";
    var STYLE_ID = "supreme-boost-style";
    var CONFIRM_STYLE_ID = "supreme-boost-confirm-style";
    var ADAPTIVE_STYLE_ID = "supreme-boost-adaptive-style";
    var BRAIN_PHASE_CLASS = "sb-brain-phase";
    var DEFAULT_TITLE = "INDICATOR WEB CHAT";
    var DEFAULT_PRIMARY = "#667eea";
    var MAX_PAGE_CHARS = 6000;
    var MAX_HISTORY = 8;
    var PAGE_TEXT_CLASS = "supreme-boost-large-text";
    var PAGE_SMALL_TEXT_CLASS = "supreme-boost-small-text";
    var SUPPORTED_LOCALES = ["th", "en", "zh", "ja", "ko", "fr", "de", "es", "it", "pt", "ru", "ar", "hi", "vi", "id", "ms", "tr", "nl", "pl", "sv", "uk"];
    var INIT_RETRY_TIMES = 5;
    var INIT_RETRY_DELAY = 300;
    var HESITATION_MS = 4000;
    var RAGE_CLICK_WINDOW = 500;
    var RAGE_CLICK_CLUSTER_PX = 30;
    var CONFUSION_SCROLL_WINDOW = 2000;
    var CONFUSION_DIRECTION_CHANGES = 2;
    var ORB_IDLE_DELAY = 25000;
    var WHISPER_DISMISS_MS = 12000;
    var HUMAN_HANDOFF_FRUSTRATION_THRESHOLD = 2;
    var AUTONOMOUS_HIGHLIGHT_DELAY = 800;

    var _st = null, _cfg = null, _msgs = null, _handoffCount = 0, _setOpen = null;
    function setOpen(b) { if (_setOpen) _setOpen(b); }

    var I18N = { th:{ subtitle:"พร้อมตอบจากข้อมูลหน้าเว็บนี้ (Ready to answer)", searchingPages:"🔍 กำลังค้นหาทุกหน้าในเว็บ... (Searching...)", foundOnOtherPages:"✨ เจอบนหน้านี้ (Found here):", placeholder:"พิมพ์คำถาม... (Type a question...)", send:"ส่ง (Send)", openChat:"เปิดแชท (Open)", closeChat:"ปิดแชท (Close)", toggleTheme:"สลับธีม (Theme)", inputLabel:"พิมพ์คำถาม (Question)", thinking:"กำลังคิด... (Thinking...)", askingMore:"กำลังถาม AI เพิ่มเติม... (Asking AI...)", noReply:"⚡ ระบบ AI กำลังอัปเดต รบกวนลองอีกครั้งสักครู่นะครับ", connectError:"เชื่อมต่อระบบ AI ไม่สำเร็จ (Connection error)", greeting:"สวัสดีครับ ผมช่วยตอบคำถามจากข้อมูลบนหน้านี้ได้เลย (Hello! I can help you with this page.)", quick:[], reset:"ปรับหน้าเว็บกลับเป็นค่าเดิมให้แล้วครับ (Reset done)", largeText:"ขยายตัวอักษรบนหน้าเว็บให้แล้วครับ (Text enlarged)", smallText:"ลดขนาดตัวอักษรบนหน้าเว็บให้แล้วครับ (Text reduced)", dark:"เปิดธีมเข้มให้แล้วครับ (Dark theme on)", light:"เปลี่ยนกลับเป็นธีมสว่างให้แล้วครับ (Light theme on)", fallbackIntro:"ตอนนี้ระบบ AI หลักเชื่อมต่อไม่ได้ชั่วคราว แต่ผมอ่านข้อมูลบนหน้านี้ให้ได้ครับ:", confirmTitle:"⚠️ ยืนยันการดำเนินการ (Confirm Action)", confirmBody:"AI ต้องการทำสิ่งนี้ในพื้นที่ที่อาจมีความเสี่ยง (AI wants to access sensitive area):", confirmAllow:"อนุญาต (Allow)", confirmDeny:"ปฏิเสธ (Deny)", whisperGeneric:"คุณกำลังสนใจตรงนี้อยู่หรือเปล่าครับ? 👀 (Interested in this?)", whisperInteraction:"มีอะไรให้ผมช่วยไหมครับ? 🛍️ (Need help?)", whisperScroll:"กำลังหาอะไรอยู่หรือเปล่าครับ? 🔍 (Looking for something?)", whisperFrustration:"เจอปัญหาตรงนี้หรือเปล่าครับ? 🔧 (Having trouble?)", carouselTitle:"รายการที่เกี่ยวข้อง (Related Items)", actionSliderTitle:"เลื่อนเพื่อดำเนินการ (Slide to Proceed)", actionSliderHint:"เลื่อนไปทางขวา (Slide right)", quickTitle:"เลือกสิ่งที่คุณต้องการ (Choose an option)", handoffTitle:"👨‍💻 กำลังเชื่อมต่อเจ้าหน้าที่ (Connecting to human)", handoffBody:"เนื่องจากคุณอาจต้องการความช่วยเหลือเพิ่มเติม ระบบกำลังแจ้งเจ้าหน้าที่ให้ทราบโดยเร็วที่สุด", handoffSummary:"สรุปสถานการณ์ล่าสุด", safetyDeny:"⛔ การดำเนินการนี้ถูกบล็อกเนื่องจากนโยบายความปลอดภัย (Blocked by safety policy)",
        brainGroq:"🔍 กำลังวิเคราะห์หน้าเว็บ... (Parsing...)", brainCohere:"🛡️ กำลังตรวจสอบความปลอดภัย... (Auditing...)", brainGemini:"✨ กำลังสร้างคำตอบ... (Generating...)" },
        en:{ subtitle:"Answers from this page", placeholder:"Type a question...", send:"Send", openChat:"Open chat", closeChat:"Close chat", toggleTheme:"Toggle theme", inputLabel:"Type a question", thinking:"Thinking...", askingMore:"Asking AI...", noReply:"Sorry, I could not generate a reply.", searchingPages:"🔍 Searching all pages...", foundOnOtherPages:"✨ Found on this page:", connectError:"Could not reach the AI server.", greeting:"Hi! I can answer questions based on this page.", quick:["What is this page about?","What's notable here?","Summarize this page","Make this easier to read"], reset:"The page has been reset.", largeText:"Text enlarged.", smallText:"Text reduced.", dark:"Dark theme on.", light:"Light theme on.", fallbackIntro:"Main AI unavailable, but I can read this page:", confirmTitle:"⚠️ Confirm Action", confirmBody:"AI wants to access a sensitive area:", confirmAllow:"Allow", confirmDeny:"Deny", whisperGeneric:"Interested in this area? 👀", whisperInteraction:"Need help with something? 🛍️", whisperScroll:"Looking for something? 🔍", whisperFrustration:"Having trouble? 🔧", carouselTitle:"Related Items", actionSliderTitle:"Slide to Proceed", actionSliderHint:"Slide right", quickTitle:"What would you like?", handoffTitle:"👨‍💻 Connecting to Human Agent", handoffBody:"It looks like you need extra help. We are notifying a human agent right away.", handoffSummary:"Recent situation summary", safetyDeny:"⛔ This action was blocked by safety policy.",
        brainGroq:"🔍 Parsing page...", brainCohere:"🛡️ Auditing safety...", brainGemini:"✨ Generating response..." } };
    
    // Auto-generate fallback for 20+ languages based on English
    var _autoLangs = {ko:"한국어",fr:"Français",de:"Deutsch",es:"Español",it:"Italiano",pt:"Português",ru:"Русский",ar:"العربية",hi:"हिन्दी",vi:"Tiếng Việt",id:"Bahasa Indonesia",ms:"Bahasa Melayu",tr:"Türkçe",nl:"Nederlands",pl:"Polski",sv:"Svenska",uk:"Українська"};
    for (var _k in _autoLangs) {
        if (!I18N[_k]) {
            // Very basic fallback structure, real translation would use actual map
            I18N[_k] = Object.assign({}, I18N.en); 
            if(_k==="ko") I18N.ko.greeting="안녕하세요! 무엇을 도와드릴까요?";
            if(_k==="fr") I18N.fr.greeting="Bonjour ! Comment puis-je vous aider ?";
            if(_k==="de") I18N.de.greeting="Hallo! Wie kann ich Ihnen helfen?";
            if(_k==="es") I18N.es.greeting="¡Hola! ¿En qué puedo ayudarle?";
            if(_k==="it") I18N.it.greeting="Ciao! Come posso aiutarti?";
            if(_k==="pt") I18N.pt.greeting="Olá! Como posso ajudar?";
            if(_k==="ru") I18N.ru.greeting="Здравствуйте! Чем могу помочь?";
        }
    }
    for (var _loc in I18N) { var _m = I18N[_loc]; if (!_m.safetyDeny) _m.safetyDeny = "⛔ Blocked by safety policy."; }

    if (window.__SUPREME_BOOST_READY__) return;
    window.__SUPREME_BOOST_READY__ = true;

    // --- Plugin Architecture API ---
    window.SupremeBoost = window.SupremeBoost || {};
    window.SupremeBoost.plugins = window.SupremeBoost.plugins || {};
    window.SupremeBoost.registerPlugin = function(name, pluginObj) {
        if (!name || !pluginObj) return false;
        window.SupremeBoost.plugins[name] = pluginObj;
        console.log("[SupremeBoost] Plugin registered:", name);
        if (typeof pluginObj.onInit === 'function') {
            pluginObj.onInit();
        }
        return true;
    };
    // --------------------------------

    function ready(cb) { if (document.readyState !== "loading") { cb(); return; } document.addEventListener("DOMContentLoaded", cb, { once: true }); setTimeout(cb, 2000); }
    function retry(fn, n) { if (n === void 0) n = INIT_RETRY_TIMES; var a = 0, go = function () { a++; try { if (document.body && fn()) return; } catch (e) { console.error("[SB] init", a, e); } if (a < n) setTimeout(go, INIT_RETRY_DELAY); else console.warn("[SB] init failed"); }; go(); }
    function getScript() { return _cs || document.querySelector('script[src*="boost.js"]'); }
    function getConfig() { var s = getScript(), u = s && s.src ? new URL(s.src, document.baseURI) : null, b = u && u.origin !== "null" ? u.origin + "/api/chat" : "/api/chat"; var wc = window.IndicatorConfig || {}; var lm = (wc.lang || getAttr(s,"data-lang","auto")).toLowerCase(); var themeKey = wc.theme || getAttr(s, "data-theme", ""); var themeMap = { "cyber-calm":"#6366f1", "modern-light":"#3b82f6", "dark-matrix":"#10b981" }; return { apiKey: wc.apiKey || getAttr(s,"data-api-key",""), title: wc.title || getAttr(s,"data-title",DEFAULT_TITLE), greeting: wc.greeting || getAttr(s,"data-greeting",""), shopPrompt: wc.shopPrompt || getAttr(s,"data-shop-prompt",""), backendUrl: wc.backendUrl || getAttr(s,"data-backend-url",b), primary: normColor(wc.primaryColor || themeMap[themeKey] || getAttr(s,"data-primary",DEFAULT_PRIMARY)), position: String(wc.position || getAttr(s,"data-position","right")).toLowerCase()==="left"?"left":"right", startOpen: String(wc.startOpen || getAttr(s,"data-open","false"))==="true", langMode: lm==="auto"?"auto":normLocale(lm) }; }
    function normLocale(v) { var c = String(v||"").toLowerCase().split("-")[0]; return SUPPORTED_LOCALES.indexOf(c)!==-1?c:"en"; }
    
    // Global Geo-Locale Engine State
    var _geoData = null;
    function detectLocale() {
        if (_geoData && _geoData.lang) return normLocale(_geoData.lang);
        var h = document.documentElement.getAttribute("lang"); 
        if (h) return normLocale(h); 
        return normLocale(navigator.language||navigator.userLanguage||"en"); 
    }
    
    function fetchGeoLocale(backendUrl, cb) {
        if (_geoData) return cb(_geoData);
        var url = backendUrl.replace("/api/chat", "/api/geo");
        var ctrl = new AbortController(), tmr = setTimeout(function(){ctrl.abort();}, 3000);
        fetch(url, { signal: ctrl.signal }).then(function(res){ return res.json(); }).then(function(data){
            clearTimeout(tmr);
            _geoData = data;
            // Best effort language mapping based on country
            if (data && data.countryCode) {
                var cc = data.countryCode.toUpperCase();
                var c2l = { TH:"th", US:"en", GB:"en", AU:"en", CN:"zh", TW:"zh", JP:"ja", KR:"ko", FR:"fr", DE:"de", ES:"es", IT:"it", BR:"pt", PT:"pt", RU:"ru", AE:"ar", SA:"ar", IN:"hi", VN:"vi", ID:"id", MY:"ms", TR:"tr", NL:"nl", PL:"pl", SE:"sv", UA:"uk" };
                _geoData.lang = c2l[cc] || "en";
            }
            cb(_geoData);
        }).catch(function(){ clearTimeout(tmr); cb(null); });
    }

    function detectTextLocale(t) { var s = String(t||""); if (!s.trim()) return null; var th=(s.match(/[\u0E00-\u0E7F]/g)||[]).length,ka=(s.match(/[\u3040-\u309F\u30A0-\u30FF]/g)||[]).length,cj=(s.match(/[\u4E00-\u9FFF]/g)||[]).length,la=(s.match(/[a-zA-Z]/g)||[]).length,tot=th+ka+cj+la; if (tot===0) return null; if (th>=Math.max(2,tot*0.15)) return "th"; if (ka>0) return "ja"; if (cj>=Math.max(2,tot*0.15)) return "zh"; if (la>0) return "en"; return null; }
    function t(loc,k) { var p = I18N[normLocale(loc)]||I18N.en; return k?p[k]:p; }
    function greeting(cfg,loc) { return cfg.greeting||t(loc,"greeting"); }
    function getAttr(el,n,fb) { if (!el) return fb; var v = el.getAttribute(n); return v===null||v.trim()===""?fb:v.trim(); }
    function normColor(v) { if (/^#[0-9a-f]{3,8}$/i.test(v)||/^rgb/.test(v)||/^hsl/.test(v)) return v; return DEFAULT_PRIMARY; }

    // Deep-Search Matrix: Structured DNA Extraction
    function extractSiteDNA() {
        var metaDesc = document.querySelector('meta[name="description"]');
        var metaKw = document.querySelector('meta[name="keywords"]');
        var ogType = document.querySelector('meta[property="og:type"]');
        
        // Structured Extraction: Headings
        var headings = document.querySelectorAll('h1, h2, h3');
        var hList = [];
        for (var hi = 0; hi < headings.length && hi < 8; hi++) { 
            var t = (headings[hi].textContent || "").replace(/\s+/g," ").trim(); 
            if (t) hList.push(headings[hi].tagName.toLowerCase() + ":" + t); 
        }

        // Structured Extraction: Products / Entities
        var entities = [];
        var productEls = document.querySelectorAll('.product, .item, .card, [class*="product"], [class*="item"]');
        for(var pi = 0; pi < productEls.length && pi < 10; pi++) {
            var p = productEls[pi];
            var titleEl = p.querySelector('h1, h2, h3, h4, .title, .name');
            var priceEl = p.querySelector('.price, [class*="price"]');
            var title = titleEl ? titleEl.textContent.trim() : "";
            var price = priceEl ? priceEl.textContent.trim() : "";
            if(title) entities.push(title + (price ? " ("+price+")" : ""));
        }

        // Structured Extraction: Tables/Data
        var dataPoints = [];
        var tables = document.querySelectorAll('table');
        if(tables.length > 0) {
            var ths = tables[0].querySelectorAll('th, td.label');
            for(var ti=0; ti<ths.length && ti<5; ti++) {
                dataPoints.push(ths[ti].textContent.trim());
            }
        }

        var centerEl = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        var activeTag = "", activeType = "", activeText = "";
        if (centerEl) {
            activeTag = centerEl.tagName || "";
            var closestSection = centerEl.closest("section,article,main,div[class],form,nav,aside,header,footer");
            if (closestSection) {
                var cn = (closestSection.className || "") + " " + (closestSection.id || "");
                if (/form/i.test(cn) || closestSection.tagName === "FORM") activeType = "form";
                else if (/article|post|entry|content|blog/i.test(cn) || closestSection.tagName === "ARTICLE") activeType = "article";
                else if (/nav|menu|header|footer/i.test(cn)) activeType = "navigation";
                else if (/product|item|card|grid|listing|shop|store/i.test(cn)) activeType = "catalog";
                else if (/sidebar|widget|aside/i.test(cn)) activeType = "sidebar";
                else activeType = "content";
                var txt = closestSection.textContent || "";
                activeText = txt.replace(/\s+/g, " ").trim().slice(0, 1000);
            }
        }

        return {
            title: document.title,
            metaDescription: metaDesc ? metaDesc.content : "",
            metaKeywords: metaKw ? metaKw.content : "",
            headings: hList,
            entities: entities,
            dataPoints: dataPoints,
            lang: document.documentElement.lang || "",
            ogType: ogType ? ogType.content : "",
            activeSectionTag: activeTag,
            activeSectionType: activeType,
            activeSectionText: activeText,
            geoContext: _geoData ? _geoData.country + " / " + _geoData.timezone : ""
        };
    }

    function maskPII(text) {
        if (typeof text !== "string" || !text) return text||"";
        return text.replace(/\b[\w.\-]+@[\w.\-]+\.\w{2,}\b/gi,"[REDACTED_EMAIL]").replace(/\b(?:\d[ -]*?){13,16}\b/g,"[REDACTED_CARD]").replace(/\b\d{13}\b/g,"[REDACTED_ID]").replace(/\b0[0-9]{8,9}\b/g,"[REDACTED_PHONE]").replace(/\b(?:นาย|นาง|นางสาว|Mr\.|Mrs\.|Ms\.|Dr\.)\s*\w+/gi,"[REDACTED_NAME]").replace(/\b(?:\+?66|0)\d{8,9}\b/g,"[REDACTED_PHONE]").replace(/\b(?:secret|token|api[-_]?key|private[-_]?key)\s*[:=]\s*['\"]?\w{8,}/gi,"[REDACTED_SECRET]");
    }

    // ─── IndexedDB Session Memory ─────────────────────────────────

    var SessionDB = {
        _db: null, _ready: false, _queue: [],
        init: function () { if (this._ready || this._initializing) return; this._initializing = true; try { var req = indexedDB.open("SupremeBoost", 1); req.onupgradeneeded = function (e) { var db = e.target.result; if (!db.objectStoreNames.contains("mem")) db.createObjectStore("mem", { keyPath: "key" }); if (!db.objectStoreNames.contains("cart")) db.createObjectStore("cart", { keyPath: "id" }); if (!db.objectStoreNames.contains("prefs")) db.createObjectStore("prefs", { keyPath: "k" }); }; var self = this; req.onsuccess = function (e) { self._db = e.target.result; self._ready = true; self._drain(); }; req.onerror = function () { self._ready = false; }; } catch (_) { this._ready = false; } },
        _drain: function () { var q = this._queue; this._queue = []; for (var i = 0; i < q.length; i++) { var item = q[i]; if (item.op === "get") this.get(item.store, item.key).then(item.resolve); else if (item.op === "set") this.set(item.store, item.key, item.value); } },
        _tx: function (store, mode) { if (!this._db) return null; try { return this._db.transaction(store, mode).objectStore(store); } catch (_) { return null; } },
        get: function (store, key) { return new Promise(function (resolve) { var self = this; if (!self._db || !self._ready) { self._queue.push({ op: "get", store: store, key: key, resolve: resolve }); return; } try { var tx = self._tx(store, "readonly"); if (!tx) return resolve(null); var req = tx.get(key); req.onsuccess = function () { resolve(req.result ? req.result.value : null); }; req.onerror = function () { resolve(null); }; } catch (_) { resolve(null); } }.bind(this)); },
        set: function (store, key, value) { var self = this; if (!self._db || !self._ready) { self._queue.push({ op: "set", store: store, key: key, value: value }); return; } try { var tx = self._tx(store, "readwrite"); if (tx) tx.put({ key: key, value: value, ts: Date.now() }); } catch (_) {} },
        getCart: function () { return this.get("cart", "current").then(function (v) { return v || []; }); },
        setCart: function (items) { this.set("cart", "current", items); },
        getPref: function (k) { return this.get("prefs", k); },
        setPref: function (k, v) { this.set("prefs", k, v); }
    };

    // ─── Behavioral Observer (Autonomous Brain) ───────────────────

    var Observer = {
        _trail:[], _scrollHist:[], _clicks:[], _hoverEl:null, _hoverSec:null, _hoverStart:0, _hoverTimer:null, _lastY:0, _enabled:true, _listeners:[],
        onHesitation:null, onFrustration:null, onConfusion:null, _handoffFrustrationCount:0,
        init:function(){var self=this;this._lastY=window.scrollY;this._add(document,"mouseover",function(e){self._onHover(e);},true);this._add(document,"mousemove",function(e){self._trail.push({x:e.clientX,y:e.clientY,t:performance.now()});if(self._trail.length>60)self._trail.shift();},true);this._add(document,"click",function(e){self._onClick(e);},true);this._add(window,"scroll",function(e){self._onScroll(e);},true);this._tick();},
        destroy:function(){this._enabled=false;for(var i=0;i<this._listeners.length;i++){var l=this._listeners[i];l.el.removeEventListener(l.evt,l.handler,l.passive);}this._listeners=[];if(this._hoverTimer){clearTimeout(this._hoverTimer);this._hoverTimer=null;}},
        _add:function(el,evt,handler,pas){el.addEventListener(evt,handler,{passive:pas});this._listeners.push({el:el,evt:evt,handler:handler,passive:pas});},
        _type:function(el){if(!el||el.id===WIDGET_ID||el.closest("#"+WIDGET_ID))return null;var tag=el.tagName,cls=(el.className||"")+" "+(el.id||""),txt=(el.textContent||"").toLowerCase(),role=el.getAttribute("role")||"";if(tag==="FORM"||tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA"||role==="form"||role==="searchbox")return"form";if(tag==="ARTICLE"||role==="article"||/post|entry|article|blog|content/i.test(cls))return"article";if(tag==="NAV"||tag==="MENU"||role==="navigation"||role==="menu"||/nav|menu/i.test(cls))return"navigation";if(tag==="BUTTON"||tag==="A"||role==="button"||role==="link")return"interactive";if(/product|item|card|grid|listing|shop|store|catalog|service/gi.test(cls))return"catalog";if(/form|input|search|signup|register|contact/i.test(cls))return"form";if(/price|cost|fee|rate|package|plan|pricing/i.test(cls))return"pricing";if(tag==="TABLE"||tag==="LI"||role==="list"||role==="listitem")return"list";return"content";},
        _captureSnippet:function(el){if(!el)return"";var exact=el.cloneNode(true);exact.querySelectorAll("script,style,svg").forEach(function(n){n.remove();});var exactText=exact.textContent.replace(/\s+/g," ").trim();var parent=el.closest('section, article, [class*="card"], [class*="container"]')||el.parentElement||el;var pclone=parent.cloneNode(true);pclone.querySelectorAll("script,style,svg").forEach(function(n){n.remove();});var parentText=pclone.textContent.replace(/\s+/g," ").trim().slice(0,500);if(exactText.length>80||exact===parent)return exactText;return "Exact focus: \""+exactText+"\" (Context: "+parentText+")";},
        _onHover:function(e){if(!this._enabled)return;var el=e.target,tp=this._type(el);if(!tp)return;if(this._hoverEl!==el){if(this._hoverTimer){clearTimeout(this._hoverTimer);this._hoverTimer=null;}this._hoverEl=el;this._hoverSec=tp;this._hoverStart=Date.now();this._hoverTimer=setTimeout(function(self,el,tp){return function(){if(!self._enabled)return;if(document.body.contains(el)&&self._hoverEl===el&&Date.now()-self._hoverStart>=HESITATION_MS){var snippet=self._captureSnippet(el);if(self.onHesitation)self.onHesitation({element:el,type:tp,duration:Date.now()-self._hoverStart,snippet:snippet});}};}(this,el,tp),HESITATION_MS);}},
        _onClick:function(e){if(!this._enabled)return;var x=e.clientX,y=e.clientY,now=Date.now();this._clicks.push({x:x,y:y,t:now,el:e.target});this._clicks=this._clicks.filter(function(c){return now-c.t<RAGE_CLICK_WINDOW;});var cnt=0;for(var i=0;i<this._clicks.length;i++){var c=this._clicks[i];if(Math.abs(c.x-x)<RAGE_CLICK_CLUSTER_PX&&Math.abs(c.y-y)<RAGE_CLICK_CLUSTER_PX)cnt++;}if(cnt>=3){var el=e.target;var snippet=this._captureSnippet(el);this._handoffFrustrationCount++;if(this.onFrustration)this.onFrustration({x:x,y:y,el:el,size:cnt,handoffCount:this._handoffFrustrationCount,snippet:snippet});this._clicks=[];}},
        _onScroll:function(){if(!this._enabled)return;var sy=window.scrollY,dir=sy>this._lastY?"down":"up";if(sy!==this._lastY){this._scrollHist.push({y:sy,t:performance.now(),d:dir});if(this._scrollHist.length>30)this._scrollHist.shift();}this._lastY=sy;},
        _tick:function(){if(!this._enabled)return;var now=performance.now(),recent=this._scrollHist.filter(function(s){return now-s.t<CONFUSION_SCROLL_WINDOW;}),self=this;if(recent.length>=4){var ch=0;for(var i=1;i<recent.length;i++){if(recent[i].d!==recent[i-1].d)ch++;}if(ch>=CONFUSION_DIRECTION_CHANGES){if(this.onConfusion)this.onConfusion({changes:ch});this._scrollHist=[];}}requestAnimationFrame(function(){self._tick();});},
        snapshot:function(){var s={scrollDepth:Math.round((window.scrollY+window.innerHeight)/Math.max(1,document.body.scrollHeight)*100),timeOnPage:Math.round((Date.now()-(window._sbSess||Date.now()))/1000),pageUrl:location.href,pageTitle:document.title,_hesitation:false,_frustration:false,_confusion:false,_hoverContext:""};if(this._hoverTimer&&Date.now()-this._hoverStart>HESITATION_MS*0.5)s._hesitation=true;if(this._handoffFrustrationCount>0)s._frustration=true;if(this._hoverEl){s._hoverContext=this._captureSnippet(this._hoverEl);}return s;}
    };

    // ─── Guardian Presence System (God-Tier Matrix) ───────────────

    var GuardianSystem = {
        _netInterval: null,
        _wasSlow: false,
        init: function() {
            this._checkNetwork();
            this._netInterval = setInterval(this._checkNetwork.bind(this), 30000);
            this._checkA11y();
        },
        _checkNetwork: function() {
            if (!navigator.connection) return;
            var conn = navigator.connection;
            var isSlow = conn.effectiveType === "2g" || conn.effectiveType === "slow-2g" || conn.saveData;
            if (isSlow && !this._wasSlow) {
                this._wasSlow = true;
                document.documentElement.classList.add("supreme-boost-slow-net");
                this._optimizePage();
                var loc = detectLocale();
                var msg = t(loc, "whisperSlowNet") || "Network is slow, optimizing page... 🐌";
                if(window.Whisper) Whisper.show(msg, "guardian");
            } else if (!isSlow && this._wasSlow) {
                this._wasSlow = false;
                document.documentElement.classList.remove("supreme-boost-slow-net");
                var loc = detectLocale();
                var msg = t(loc, "whisperFastNet") || "Network restored! 🚀";
                if(window.Whisper) Whisper.show(msg, "guardian");
            }
        },
        _optimizePage: function() {
            document.querySelectorAll('img:not([loading="lazy"])').forEach(function(img) {
                img.setAttribute('loading', 'lazy');
            });
            document.querySelectorAll('video').forEach(function(v) {
                if(!v.paused) v.pause();
                v.removeAttribute('autoplay');
            });
        },
        _checkA11y: function() {
            var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                SessionDB.getPref("theme").then(function(t) {
                    if(!t) {
                        document.documentElement.classList.add("supreme-boost-dark-page");
                        SessionDB.setPref("theme", "dark");
                    }
                });
            }
        }
    };

    // ─── SafetyShield v2 — Hardened HITL Interceptor ──────────────

    var SAFE_SEL = [
        'input[type="password"]', 'form:has(input[type="password"])',
        'iframe', 'frame', 'embed', 'object',
        '[class*="payment"]', '[id*="payment"]',
        '[class*="login"]', '[id*="login"]', '[class*="admin"]', '[id*="admin"]',
        '[class*="checkout"]', '[id*="checkout"]', '[class*="secure"]',
        '[data-payment]', '[data-checkout]', '[data-login]',
        'form[action*="checkout"]', 'form[action*="payment"]',
        'form[action*="login"]', 'form[action*="signin"]',
        '[class*="credit-card"]', '[id*="credit-card"]',
        '[class*="password"]', '[class*="credential"]',
        'input[type="hidden"]', 'input[autocomplete="cc-number"]',
        'input[autocomplete="cc-csc"]', 'input[autocomplete="cc-exp"]'
    ];

    function matchesSafeSel(el) {
        if (!el) return false;
        for (var i=0;i<SAFE_SEL.length;i++){
            var s=SAFE_SEL[i];
            try {
                if (el.matches && el.matches(s)) return true;
                if (el.closest && el.closest(s)) return true;
            } catch(e){}
        }
        return false;
    }

    function safetyShield(action, locale, onAllow, onDeny) {
        if (!action || !action.type) return true;
        var needsConfirm = false;

        if (action.type === "warp" && action.targetText) {
            var found = findEl(action.targetText, action.keywords || []);
            if (found && matchesSafeSel(found)) needsConfirm = true;
        }
        if (action.type === "highlight" && action.selector) {
            try { var el = document.querySelector(action.selector); if (el && matchesSafeSel(el)) needsConfirm = true; } catch(e) {}
        }
        if (action.type === "inject_html") needsConfirm = true;
        if (action.confirmationRequired) needsConfirm = true;
        if (action.type === "warp" && action.willNavigate) needsConfirm = true;

        if (!needsConfirm) return true;
        showConfirm(action, locale, onAllow, onDeny);
        return false;
    }

    function interceptSyntheticEvent(targetEl, action, locale) {
        if (!targetEl) return false;
        if (!matchesSafeSel(targetEl)) return false;
        safetyShield(action, locale,
            function () { /* allowed - proceed */ },
            function () {
                if (_msgs) addMsg(_msgs, "assistant", "⛔ " + t(locale, "safetyDeny"));
            }
        );
        return true;
    }

    SessionDB.init();

    var InteractiveWhisper = {
        _el:null,_container:null,_shadow:null,
        init:function(shadow){this._shadow=shadow;this._el=shadow.querySelector(".sb-interactive");this._container=shadow.querySelector(".sb-whisper-container");},
        render:function(interactive,locale){if(!interactive||!interactive.type||!this._container)return;var strings=t(locale);switch(interactive.type){case"carousel":if(interactive.items&&interactive.items.length){InlineShelf.show(interactive.items,locale);}return;default:break;}this._container.innerHTML="";var wrapper=document.createElement("div");wrapper.className="sb-i-wrap";switch(interactive.type){case"action_slider":this._renderActionSlider(wrapper,interactive,strings);break;case"options":this._renderOptions(wrapper,interactive,strings,locale);break;default:return;}this._container.appendChild(wrapper);this._container.style.display="block";var ro = document.getElementById(WIDGET_ID); if(ro) ro.classList.add("sb-iw-open");},
        hide:function(){if(this._container){this._container.style.display="none";this._container.innerHTML="";var ro = document.getElementById(WIDGET_ID); if(ro) ro.classList.remove("sb-iw-open");}}
    };

    // ─── InlineShelf — recommendation cards on the page ───────────

    var InlineShelf = {
        _el: null, _visible: false, _timer: null,
        init: function () {
            if (this._el) return;
            var el = document.createElement("div");
            el.className = "sb-shelf";
            el.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:2147483000;background:rgba(255,255,255,0.96);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-top:1px solid rgba(226,232,240,0.6);box-shadow:0 -8px 32px rgba(0,0,0,0.1);padding:12px 16px;transform:translateY(100%);transition:transform 0.5s cubic-bezier(0.34,1.56,0.64,1);user-select:none;";
            el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span class="sb-shelf-title" style="font-weight:700;font-size:14px;color:#0f172a;">\u2726 \u0E04\u0E33\u0E41\u0E19\u0E30\u0E19\u0E33</span><button class="sb-shelf-close" style="margin-left:auto;border:0;background:rgba(0,0,0,0.06);border-radius:50%;width:26px;height:26px;font-size:14px;cursor:pointer;display:grid;place-items:center;color:#64748b;transition:all 0.2s ease;">\u00D7</button></div><div class="sb-shelf-track" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none;overflow-y:hidden;"></div>';
            document.body.appendChild(el);
            this._el = el;
            el.querySelector(".sb-shelf-close").addEventListener("click", this.hide.bind(this));
            document.addEventListener("click", function (e) { if (InlineShelf._visible && !el.contains(e.target)) InlineShelf.hide(); });
        },
        show: function (items, locale) {
            this.init();
            var track = this._el.querySelector(".sb-shelf-track");
            track.innerHTML = "";
            var titleEl = this._el.querySelector(".sb-shelf-title");
            var strs = t(locale);
            titleEl.textContent = "\u2726 " + (strs.carouselTitle || "Recommendations");
            (items || []).slice(0, 8).forEach(function (item) {
                var name = item && (item.name || item.label || item.title || "");
                var desc = item && (item.description || "");
                var img = item && item.image || "";
                if (!name) return;
                var card = document.createElement("div");
                card.style.cssText = "flex:0 0 auto;width:140px;padding:10px;border-radius:12px;background:rgba(255,255,255,0.6);border:1px solid rgba(226,232,240,0.6);cursor:pointer;transition:all 0.25s cubic-bezier(0.34,1.56,0.64,1);";
                card.innerHTML = '<div style="height:60px;border-radius:8px;margin-bottom:6px;display:flex;align-items:center;justify-content:center;font-size:24px;background:linear-gradient(135deg,#e2e8f0,#cbd5e1);color:#94a3b8;">' + (img ? '<img src="' + escHtml(img) + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">' : '\uD83D\uDCCD') + '</div><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#0f172a;">' + escHtml(name.slice(0, 40)) + '</div>' + (desc ? '<div style="font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">' + escHtml(desc.slice(0, 35)) + '</div>' : '');
                card.addEventListener("mouseenter", function () { card.style.transform = "translateY(-3px)"; card.style.boxShadow = "0 6px 16px rgba(0,0,0,0.1)"; card.style.borderColor = (_cfg ? _cfg.primary : "#667eea"); });
                card.addEventListener("mouseleave", function () { card.style.transform = "translateY(0)"; card.style.boxShadow = "none"; card.style.borderColor = "rgba(226,232,240,0.6)"; });
                card.addEventListener("click", function () {
                    InlineShelf.hide();
                    if (_st) { _st.selectedText = name; setOpen(true); }
                });
                track.appendChild(card);
            });
            if (this._timer) clearTimeout(this._timer);
            this._timer = setTimeout(this.hide.bind(this), 30000);
            this._visible = true;
            this._el.style.transform = "translateY(0)";
            var ro = document.getElementById(WIDGET_ID); if(ro) ro.classList.add("sb-shelf-open");
        },
        hide: function () {
            if (!this._el || !this._visible) return;
            this._el.style.transform = "translateY(100%)";
            this._visible = false;
            if (this._timer) { clearTimeout(this._timer); this._timer = null; }
            var ro = document.getElementById(WIDGET_ID); if(ro) ro.classList.remove("sb-shelf-open");
        }
    };

    var AmbientUI = {
        _root:null,_shadow:null,_orb:null,_aura:null,_expanded:false,_state:"idle",
        init:function(root,shadow,pri){this._root=root;this._shadow=shadow;root.style.setProperty("--ai-primary",pri);this._orb=shadow.querySelector(".sb-orb");this._aura=root.querySelector(".sb-aura");this._state="idle";},
        setState:function(s){if(s===this._state)return;this._state=s;var r=this._root;r.classList.remove("sb-orb-idle","sb-orb-watching","sb-orb-proactive","sb-brain-groq","sb-brain-cohere","sb-brain-gemini");r.classList.add("sb-orb-"+s);},
        setBrainPhase:function(phase){var r=this._root;r.classList.remove("sb-brain-groq","sb-brain-cohere","sb-brain-gemini");if(phase)r.classList.add("sb-brain-"+phase);},
        showAura:function(el){if(!el||!this._aura)return;var r=el.getBoundingClientRect(),a=this._aura;a.style.display="block";a.style.left=(r.left+window.scrollX-12)+"px";a.style.top=(r.top+window.scrollY-12)+"px";a.style.width=(r.width+24)+"px";a.style.height=(r.height+24)+"px";a.style.opacity="1";if(a._t)clearTimeout(a._t);a._t=setTimeout(function(){a.style.opacity="0";a.style.display="none";},6000);},
        clearAura:function(){if(this._aura){this._aura.style.opacity="0";this._aura.style.display="none";if(this._aura._t)clearTimeout(this._aura._t);}},
        expand:function(){if(this._expanded)return;this._expanded=true;this._root.classList.add("sb-expanded");this._root.classList.remove("sb-orb-watching","sb-orb-proactive");},
        collapse:function(){if(!this._expanded)return;this._expanded=false;this._root.classList.remove("sb-expanded");this._root.classList.add("sb-orb-idle");},
        isExpanded:function(){return this._expanded;}
    };

    var Whisper = {_el:null,_timer:null,_visible:false,init:function(shadow){this._el=document.getElementById(WIDGET_ID+"-whisper");},show:function(text,type){if(!this._el)return;if(this._timer)clearTimeout(this._timer);var label="⚡ AI INSIGHT";if(type==="proactive")label="🔮 AI ตรวจจับ";else if(type==="greeting")label="🤖 AI ทักทาย";else if(type==="hint")label="💡 คำแนะนำ";var words=text.split(" ");var spans=words.map(function(w,i){return'<span style="opacity:0;display:inline-block;transform:translateY(10px) scale(0.9);animation:sbFloatWord 0.5s cubic-bezier(0.34,1.56,0.64,1) '+(0.08+i*0.06)+'s forwards;">'+w+'</span>';}).join(' ');this._el.innerHTML='<span class="sb-whisper-label">'+label+'</span>'+spans;this._el.className="sb-whisper sb-whisper-"+(type||"info");this._el.style.opacity="1";this._el.style.transform="translateY(0) scale(1)";this._visible=true;this._timer=setTimeout(this.hide.bind(this),WHISPER_DISMISS_MS);},hide:function(){if(!this._el||!this._visible)return;this._visible=false;this._el.style.opacity="0";this._el.style.transform="translateY(10px) scale(0.95)";if(this._timer){clearTimeout(this._timer);this._timer=null;}},isVisible:function(){return this._visible;}};

    function triggerHandoff(locale,context){_handoffCount++;var strs=t(locale);if(!_st||!_msgs)return;setOpen(true);var card=document.createElement("div");card.className="sb-msg sb-assistant sb-handoff";card.innerHTML='<div style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;border-radius:12px;padding:16px;text-align:center;animation:sbSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1);"><div style="font-size:24px;margin-bottom:4px;">\uD83D\uDC68\u200D\uD83D\uDCBB</div><div style="font-weight:700;font-size:15px;margin-bottom:4px;">'+strs.handoffTitle+'</div><div style="font-size:12px;opacity:0.9;margin-bottom:10px;">'+strs.handoffBody+'</div><div style="background:rgba(255,255,255,0.2);border-radius:8px;padding:8px;font-size:11px;text-align:left;line-height:1.5;"><strong>'+strs.handoffSummary+':</strong><br>'+escHtml(context.slice(0,300))+'</div><div style="margin-top:10px;font-size:11px;opacity:0.7;">ID #'+_handoffCount+'</div></div>';_msgs.appendChild(card);_msgs.scrollTop=_msgs.scrollHeight;SessionDB.setPref("handoff",{count:_handoffCount,time:Date.now(),context:context.slice(0,300)});}

    function init() {
        try {
            if (!document.body) return false;
            if (document.getElementById(WIDGET_ID)) return true;

            var cfg = getConfig(), side = cfg.position, pri = cfg.primary;
            window._sbSess = Date.now();

            // ─── Host element (minimal — just positioning & overlay elements) ───
            var root = document.createElement("div");
            root.id = WIDGET_ID;
            root.className = "sb-root sb-" + side + " sb-orb-idle";
            root.style.setProperty("--ai-primary", pri);

            var glowBase = document.createElement("div"); glowBase.className = "sb-glow-base";
            var aura = document.createElement("div"); aura.className = "sb-aura";
            
            // ─── Shadow DOM (full CSS isolation for all widget UI) ─────────────
            var shadow = root.attachShadow({mode: 'open'}); // open for test access
            var styleEl = document.createElement("style");
            styleEl.textContent = buildShadowStyles(cfg);
            shadow.appendChild(styleEl);

            var whisperContainer = document.createElement("div"); whisperContainer.className = "sb-whisper-container";
            var whisper = document.createElement("div"); whisper.id = WIDGET_ID + "-whisper"; whisper.className = "sb-whisper";
            var panel = document.createElement("section"); panel.className = "sb-panel";
            panel.innerHTML = '<div class="sb-header"><div><div class="sb-title">' + cfg.title + '</div><div class="sb-subtitle"></div></div><div class="sb-actions"><button class="sb-icon-btn" type="button" data-action="theme">\u25D0</button><button class="sb-icon-btn" type="button" data-action="close">\u00D7</button></div></div><div class="sb-messages"></div><div class="sb-quick"></div><form class="sb-compose"><textarea class="sb-input" rows="1"></textarea><button class="sb-voice-btn" type="button" style="background:transparent;border:0;cursor:pointer;font-size:18px;color:#64748b;padding:0 8px;transition:color 0.2s;" title="พูดด้วยเสียง">\uD83C\uDFA4</button><button class="sb-send" type="submit"></button></form>';
            var orb = document.createElement("button"); orb.className = "sb-orb"; orb.type = "button";

            shadow.appendChild(whisperContainer);
            shadow.appendChild(panel);
            shadow.appendChild(orb);
            document.body.appendChild(root);
            document.body.appendChild(whisper); // ← Outside shadow DOM so position:fixed works correctly

            // Shadow query helper for interactive renderer
            function sb$(sel) { return shadow.querySelector(sel); }

            var subtitle = panel.querySelector(".sb-subtitle");
            var messages = panel.querySelector(".sb-messages");
            var quick = panel.querySelector(".sb-quick");
            var form = panel.querySelector(".sb-compose");
            var input = panel.querySelector(".sb-input");
            var sendBtn = panel.querySelector(".sb-send");
            var closeBtn = panel.querySelector('[data-action="close"]');
            var themeBtn = panel.querySelector('[data-action="theme"]');
            var voiceBtn = panel.querySelector(".sb-voice-btn");

            var state = { open: false, busy: false, selectedText: "", history: [], locale: normLocale(detectLocale()) };
            _st = state; _cfg = cfg; _msgs = messages; _setOpen = setOpen;

            // --- Voice System ---
            var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            var recognition = SpeechRecognition ? new SpeechRecognition() : null;
            var isListening = false;
            if (recognition) {
                recognition.continuous = false;
                recognition.interimResults = false;
                recognition.onstart = function() {
                    isListening = true;
                    if(voiceBtn) voiceBtn.style.color = "#ef4444";
                    input.placeholder = "กำลังฟัง... (Listening...)";
                };
                recognition.onresult = function(e) {
                    var text = e.results[0][0].transcript;
                    input.value = text;
                    setTimeout(function() { sendMsg(text); }, 300);
                };
                recognition.onerror = function() { isListening = false; if(voiceBtn) voiceBtn.style.color = "#64748b"; input.placeholder = t(state.locale).placeholder; };
                recognition.onend = function() { isListening = false; if(voiceBtn) voiceBtn.style.color = "#64748b"; input.placeholder = t(state.locale).placeholder; };
                if (voiceBtn) {
                    voiceBtn.addEventListener("click", function(e) {
                        e.preventDefault();
                        if (isListening) { recognition.stop(); } 
                        else { recognition.lang = state.locale === "th" ? "th-TH" : "en-US"; recognition.start(); }
                    });
                }
            } else if (voiceBtn) {
                voiceBtn.style.display = "none";
            }

            // Global Text-to-Speech function for this widget
            window.speakText = function(text) {
                if (!window.speechSynthesis) return;
                window.speechSynthesis.cancel();
                var clean = text.replace(/[#*`_]/g, '');
                var isThai = state.locale === 'th';
                var ut = new SpeechSynthesisUtterance(clean);
                ut.lang = isThai ? 'th-TH' : (state.locale === 'ja' ? 'ja-JP' : state.locale === 'zh' ? 'zh-CN' : 'en-US');
                ut.rate = isThai ? 1.0 : 1.1;
                ut.pitch = 1.0;
                if (isThai) {
                    var voices = window.speechSynthesis.getVoices();
                    var thaiVoice = voices.find(function(v) { return v.lang === 'th-TH'; })
                        || voices.find(function(v) { return v.lang && v.lang.toLowerCase().startsWith('th'); });
                    if (thaiVoice) {
                        ut.voice = thaiVoice;
                        window.speechSynthesis.speak(ut);
                    } else {
                        // Chrome loads voices async — wait then speak
                        var done = false;
                        window.speechSynthesis.onvoiceschanged = function() {
                            if (done) return; done = true;
                            var v2 = window.speechSynthesis.getVoices();
                            var tv = v2.find(function(v) { return v.lang === 'th-TH'; }) || v2.find(function(v) { return v.lang && v.lang.toLowerCase().startsWith('th'); });
                            if (tv) ut.voice = tv;
                            window.speechSynthesis.speak(ut);
                            window.speechSynthesis.onvoiceschanged = null;
                        };
                    }
                } else {
                    window.speechSynthesis.speak(ut);
                }
            };

            AmbientUI.init(root, shadow, pri);
            Whisper.init(shadow);
            InteractiveWhisper.init(shadow);
            InlineShelf.init();
            GuardianSystem.init();

            var ui = { subtitle: subtitle, input: input, sendBtn: sendBtn, closeBtn: closeBtn, themeBtn: themeBtn, panel: panel };
            applyLocale(ui, state.locale, cfg);
            addMsg(messages, "assistant", greeting(cfg, state.locale));
            renderQuick(quick, input, sendMsg, state.locale);

            // Fetch GeoLocale on load and update UI invisibly
            fetchGeoLocale(cfg.backendUrl, function(geo) {
                if (geo && geo.lang && geo.lang !== state.locale) {
                    state.locale = geo.lang;
                    applyLocale(ui, state.locale, cfg);
                    // Update the first message quietly
                    var firstMsg = messages.querySelector(".sb-msg-text");
                    if(firstMsg) firstMsg.innerHTML = escHtml(greeting(cfg, state.locale));
                    renderQuick(quick, input, sendMsg, state.locale);
                }
            });

            SessionDB.getPref("history").then(function (h) { if (Array.isArray(h)) state.history = h.slice(-MAX_HISTORY); });
            SessionDB.getPref("theme").then(function (t) { if (t === "dark") document.documentElement.classList.add("supreme-boost-dark-page"); });

            orb.addEventListener("click", function (e) { e.stopPropagation(); if (AmbientUI.isExpanded()) { setOpen(false); } else { setOpen(true); AmbientUI.setState("idle"); InteractiveWhisper.hide(); } });
            closeBtn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(false); });
            themeBtn.addEventListener("click", function () { document.documentElement.classList.toggle("supreme-boost-dark-page"); SessionDB.setPref("theme", document.documentElement.classList.contains("supreme-boost-dark-page") ? "dark" : "light"); });
            form.addEventListener("submit", function (e) { e.preventDefault(); sendMsg(input.value); });
            input.addEventListener("input", function () { autoGrow(input); });
            input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); } });
            document.addEventListener("selectionchange", function () { var s = window.getSelection(), t = s ? s.toString().trim() : ""; if (t.length > 20) state.selectedText = t.slice(0, 1200); });

            // ─── Autonomous Brain — fires on behavior metrics without user invocation ───
            Observer.onHesitation = function (info) {
                if (state.open || state.busy) return;
                Whisper.hide(); AmbientUI.showAura(info.element); AmbientUI.setState("watching");
                AmbientUI.setBrainPhase("groq");

                // ── Universal: read whatever the mouse is over ──────────────
                var hoverText = info.element
                    ? (info.element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400)
                    : "";

                // Skip if hovered element has no meaningful text (icons, dividers etc.)
                if (!hoverText || hoverText.length < 8) return;

                // Smart whisper: show loading bubble immediately
                Whisper.show("🤔 กำลังคิดเรื่องนี้อยู่ไหมครับ?", "hesitation");

                // Build universal context prompt — AI reads what the user sees and decides what to say
                var contextPrompt = "The user's mouse is hovering over the following content on the webpage:\n" + hoverText + "\n\n" +
                    "INSTRUCTIONS: Read the content and respond with 1-2 short, catchy, and highly contextual sentences in the user's language (" + normLocale(state.locale) + "). " +
                    "CRITICAL: Do NOT use formulaic phrases like 'คุณกำลังดูที่...' (You are looking at...). " +
                    "Instead, adapt completely to the context. For example, if it's a price, pitch its value. If it's a feature, explain how it helps. If it's a headline, offer an exciting insight. Be natural, unpredictable, and act like a very smart guide.";

                AmbientUI._pending = { el: info.element, kw: [hoverText.slice(0, 50)], snippet: hoverText };

                // Fire proactive AI with the universal hover context
                doProactive(contextPrompt, { _hesitation: true, _hoverContext: hoverText });

                // Soft highlight the hovered element
                setTimeout(function () {
                    if (info.element && document.body.contains(info.element) && !state.open && !state.busy) {
                        var origOutline = info.element.style.outline;
                        info.element.style.transition = "outline 0.3s ease";
                        info.element.style.outline = "2px solid " + pri;
                        info.element.style.outlineOffset = "2px";
                        setTimeout(function () {
                            info.element.style.outline = origOutline;
                        }, 3000);
                    }
                }, AUTONOMOUS_HIGHLIGHT_DELAY);
            };
            Observer.onFrustration = function (info) {
                if (state.open || state.busy) return;
                Whisper.hide(); AmbientUI.setState("watching"); AmbientUI.setBrainPhase("cohere"); AmbientUI.showAura(info.el || document.body);
                Whisper.show(t(state.locale, "whisperFrustration"), "frustration");
                doProactive(undefined, { _frustration: true, _frustrationCount: info.handoffCount });
                if (info.handoffCount >= HUMAN_HANDOFF_FRUSTRATION_THRESHOLD) {
                    var context = "User showing frustration at: " + (info.el ? info.el.tagName + "." + (info.el.className || "").slice(0, 40) : "unknown") + " | Snippet: " + (info.snippet || "").slice(0, 200);
                    triggerHandoff(state.locale, context);
                }
            };
            Observer.onConfusion = function () {
                if (state.open || state.busy) return;
                Whisper.hide(); AmbientUI.setState("watching"); AmbientUI.setBrainPhase("gemini"); Whisper.show(t(state.locale, "whisperScroll"), "confusion"); AmbientUI._pending = null;
            };
            Observer.init();

            whisper.addEventListener("click", function () { Whisper.hide(); setOpen(true); AmbientUI.setState("idle"); AmbientUI.clearAura(); AmbientUI.setBrainPhase(null); });

            setTimeout(function () { if (!state.open) root.classList.add("sb-nudge"); }, ORB_IDLE_DELAY);
            handlePostWarp();
            setOpen(cfg.startOpen);

            function setOpen(open) {
                state.open = open;
                if (open) {
                    AmbientUI.expand();
                    AmbientUI.clearAura();
                    InteractiveWhisper.hide();
                    InlineShelf.hide();
                    root.classList.add("sb-open");
                    root.classList.remove("sb-nudge");
                    setTimeout(function () { try { input.focus(); } catch(e) {} }, 300);
                } else {
                    AmbientUI.collapse();
                    root.classList.remove("sb-open");
                    Whisper.hide();
                    AmbientUI.setBrainPhase(null);
                }
            }

            async function sendMsg(raw) {
                var text = String(raw || "").trim();
                if (!text || state.busy) return;
                var rl = detectTextLocale(text) || (cfg.langMode !== "auto" ? cfg.langMode : state.locale);
                if (cfg.langMode === "auto" && rl !== state.locale) { state.locale = rl; applyLocale(ui, state.locale, cfg); renderQuick(quick, input, sendMsg, state.locale, true); }
                var cmd = localCmd(text, state.locale);
                var strs = t(state.locale);
                setOpen(true); root.classList.remove("sb-nudge"); input.value = ""; autoGrow(input);
                state.busy = true; form.classList.add("sb-busy");
                addMsg(messages, "user", text);
                pushHist(state, "user", text);
                var load = addMsg(messages, "assistant", cmd ? cmd.reply + "\n" + strs.askingMore : strs.thinking, true);
                try {
                    // Phase indicator: Groq → Cohere → Gemini sequence
                    AmbientUI.setBrainPhase("groq");
                    updateMsg(load, strs.brainGroq);
                    await sleep(200);

                    AmbientUI.setBrainPhase("cohere");
                    updateMsg(load, strs.brainCohere);
                    await sleep(200);

                    AmbientUI.setBrainPhase("gemini");
                    updateMsg(load, strs.brainGemini);
                    await sleep(200);

                    var data = await askAI(cfg, state, text, rl);
                    AmbientUI.setBrainPhase(null);
                    var reply = mergeCmd(cmd, data.reply || "");
                    updateMsg(load, reply || strs.noReply, true);
                    pushHist(state, "assistant", reply || "");
                    SessionDB.setPref("history", state.history);
                    
                    // Auto-read the reply if it's not a local command
                    if (reply && !cmd) speakText(reply);

                    if (data.cssCommand && safeCss(data.cssCommand)) { styleEl.textContent += "\n/* AI */\n" + data.cssCommand.trim() + "\n"; }
                    if (data.interactive) { InteractiveWhisper.render(data.interactive, state.locale); }
                    if (data.action) { execAction(data.action); }
                    else if (data.reply) { autoWarpCheck(data.reply); }
                } catch (err) {
                    AmbientUI.setBrainPhase(null);
                    console.error("Chat:", err);
                    var fb = localReply(text, state.locale);
                    var emsg = err && err.message && !/^HTTP/i.test(err.message) ? err.message : strs.connectError;
                    updateMsg(load, cmd ? cmd.reply : (fb || emsg), true);
                } finally { state.busy = false; form.classList.remove("sb-busy"); try { input.focus(); } catch(e) {} }
            }

            return true;
        } catch (e) { console.error("[SB] Init error:", e); return false; }
    }

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    var _proactiveAbort = null;
    function doProactive(overridePrompt, overrideSnapshot) {
        if (!_st || !_cfg || _st.open || _st.busy) return;
        if (_proactiveAbort) { try { _proactiveAbort.abort(); } catch(e){} }
        _proactiveAbort = new AbortController();
        var currentAbort = _proactiveAbort;
        var snap = Observer.snapshot();
        if (overrideSnapshot) { for (var k in overrideSnapshot) { if (Object.prototype.hasOwnProperty.call(overrideSnapshot, k)) snap[k] = overrideSnapshot[k]; } }
        var dna = extractSiteDNA();
        var to = setTimeout(function () { currentAbort.abort(); }, 12000);
        fetch(_cfg.backendUrl, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKey: _cfg.apiKey, prompt: overridePrompt || "", proactive: true, domSnapshot: snap, siteDNA: dna, pageContent: collectContent(), selectedText: "", history: [], url: location.href, title: document.title, locale: normLocale(_st.locale), hoverContext: snap._hoverContext || "" }),
            signal: currentAbort.signal
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (data) {
            clearTimeout(to);
            if (currentAbort !== _proactiveAbort) return;
            if (!data || data.status === "silent_abort" || _st.open) return;
            if (data.interactive) {
                Whisper.hide();
                InteractiveWhisper.render(data.interactive, _st.locale);
            } else if (data.reply) {
                InteractiveWhisper.hide();
                Whisper.show(data.reply.slice(0, 160), "proactive");
            }
            if (data.action) {
                safetyShield(data.action, _st.locale,
                    function () { execAction(data.action); },
                    function () { }
                );
            }
        }).catch(function () { clearTimeout(to); });
    }

    async function askAI(cfg, state, prompt, locale) {
        var snap = Observer.snapshot();
        var dna = extractSiteDNA();
        var ctrl = new AbortController(), to = setTimeout(function () { ctrl.abort(); }, 25000);
        try {
            var r = await fetch(cfg.backendUrl, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: cfg.apiKey, prompt: maskPII(prompt), pageContent: maskPII(collectContent()), siteDNA: dna, selectedText: maskPII(state.selectedText), history: maskHist(state.history), url: location.href, title: document.title, locale: normLocale(locale), domSnapshot: snap }),
                signal: ctrl.signal
            });
            if (r.status === 404) {
                var isRelative = cfg.backendUrl.indexOf(location.origin) === 0 || cfg.backendUrl.indexOf('/') === 0;
                if (isRelative) {
                    throw new Error("⚠️ การเชื่อมต่อ API ล้มเหลว (404) - หากเว็บนี้โฮสต์บน Netlify หรือแบบ Static กรุณานำระบบไปติดตั้งบน Vercel แล้วนำ Backend URL มาใส่ใน Embed Code");
                }
            }
            var d = await r.json().catch(function () { return {}; });
            if (!d || d.status === "silent_abort") return { reply: "", cssCommand: "", action: null, interactive: null };
            if (d.status === "blocked" && d.reply) return { reply: "⚠️ " + d.reply, cssCommand: "", action: null, interactive: null };
            if (!r.ok) throw new Error(d.error || d.reply || "HTTP " + r.status);
            return { reply: d.reply||"", cssCommand:d.cssCommand||"", action:d.action||null, interactive:d.interactive||null };
        } finally { clearTimeout(to); }
    }

    function applyLocale(ui, loc, cfg) { var s = t(loc); ui.subtitle.textContent = s.subtitle; ui.input.placeholder = s.placeholder; ui.input.setAttribute("aria-label", s.inputLabel); ui.sendBtn.textContent = s.send; ui.closeBtn.setAttribute("aria-label", s.closeChat); ui.themeBtn.setAttribute("aria-label", s.toggleTheme); var ro = document.getElementById(WIDGET_ID); if (ro && ro.shadowRoot) { var o = ro.shadowRoot.querySelector(".sb-orb"); if (o) o.setAttribute("aria-label", s.openChat); } }
    function renderQuick(c, inp, onPick, loc, rep) { if (rep) c.innerHTML = ""; var items = t(loc, "quick"); items.forEach(function (l) { var b = document.createElement("button"); b.type = "button"; b.className = "sb-chip"; b.textContent = l; b.addEventListener("click", function () { inp.value = l; onPick(l); }); c.appendChild(b); }); }
    function addMsg(c, role, text, load) { var m = document.createElement("div"); m.className = "sb-msg sb-" + role + (load ? " sb-loading" : ""); if(role==="assistant" && !load) { m.innerHTML=""; var w=text.split(/(\s+)/); w.forEach(function(x,i){ if(!x)return; var s=document.createElement("span"); s.textContent=x; if(!/^\s+$/.test(x)){s.style.opacity="0";s.style.display="inline-block";s.style.transform="translateY(10px) scale(0.9)";s.style.animation="sbFloatWord 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards";s.style.animationDelay=(i*0.03)+"s";} m.appendChild(s); }); } else { m.textContent = text; } c.appendChild(m); c.scrollTop = c.scrollHeight; return m; }
    function updateMsg(m, t, isFinal) { m.classList.remove("sb-loading"); if(m.classList.contains("sb-assistant") && isFinal){ m.innerHTML=""; var w=t.split(/(\s+)/); w.forEach(function(x,i){ if(!x)return; var s=document.createElement("span"); s.textContent=x; if(!/^\s+$/.test(x)){s.style.opacity="0";s.style.display="inline-block";s.style.transform="translateY(10px) scale(0.9)";s.style.animation="sbFloatWord 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards";s.style.animationDelay=(i*0.03)+"s";} m.appendChild(s); }); } else { m.textContent = t; } var p = m.parentElement; if (p) p.scrollTop = p.scrollHeight; }
    function pushHist(s, r, t) { if (!t) return; s.history.push({ role: r, text: String(t).slice(0, 1200) }); if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY); }
    function autoGrow(i) { i.style.height = "auto"; i.style.height = Math.min(i.scrollHeight, 120) + "px"; }
    function maskHist(h) { if (!Array.isArray(h)) return []; return h.slice(-MAX_HISTORY).map(function (i) { return { role: i.role === "assistant" ? "assistant" : "user", text: maskPII(String(i.text || "").slice(0, 1000)) }; }).filter(function (i) { return i.text; }); }

    function localCmd(text, loc) {
        var v = String(text || "").toLowerCase(), h = document.documentElement, s = t(loc);
        if (/(reset|รีเซ็ต|คืนค่า|กลับปกติ|恢复|重置|リセット)/i.test(v)) { h.classList.remove(PAGE_TEXT_CLASS, PAGE_SMALL_TEXT_CLASS, "supreme-boost-dark-page"); return { type: "reset", reply: s.reset }; }
        if (/(ขยาย|ตัวใหญ่|เพิ่มขนาด|อ่านง่าย|bigger|large|zoom in|放大|読みやす)/i.test(v)) { h.classList.add(PAGE_TEXT_CLASS); h.classList.remove(PAGE_SMALL_TEXT_CLASS); return { type: "large-text", reply: s.largeText }; }
        if (/(ลดขนาด|ตัวเล็ก|เล็กลง|smaller|zoom out|缩小|文字を小)/i.test(v)) { h.classList.add(PAGE_SMALL_TEXT_CLASS); h.classList.remove(PAGE_TEXT_CLASS); return { type: "small-text", reply: s.smallText }; }
        if (/(ธีมเข้ม|โหมดมืด|dark mode|dark|深色|ダーク)/i.test(v)) { h.classList.add("supreme-boost-dark-page"); return { type: "dark", reply: s.dark }; }
        if (/(ธีมสว่าง|โหมดสว่าง|light mode|浅色|ライト)/i.test(v)) { h.classList.remove("supreme-boost-dark-page"); return { type: "light", reply: s.light }; }
        return null;
    }
    function mergeCmd(cmd, ai) { var r = String(ai || "").trim(); if (!cmd) return r; if (!r) return cmd.reply; return /(ปรับ|ขยาย|ลด|เปิด|เรียบร้อย|done|updated)/i.test(r) ? r : cmd.reply + "\n\n" + r; }
    function autoWarpCheck(reply) { var l = reply.toLowerCase(); if (/(พบ|เจอ|อยู่ที่|located|found|here is|นี่คือ|this is|go to|ไปที่)/i.test(l)) { var k = l.replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(function(w){return w.length>2;}).slice(0,8); if (k.length > 0) { var t = findEl(k.join(' '), k); if (t) { var warpAction = { type: "warp", targetText: k.join(' '), keywords: k, willNavigate: false }; if (safetyShield(warpAction, _st ? _st.locale : "en", function () { warpEl(t); }, function(){})) { warpEl(t); } } } } }

    function safeEl(el) { if (!el||el.id===WIDGET_ID||el.closest("#"+WIDGET_ID)) return false; for (var i=0;i<SAFE_SEL.length;i++){var s=SAFE_SEL[i];if(el.matches&&el.matches(s))return false;if(el.closest&&el.closest(s))return false;} return true; }
    function depth(el) { var d=0,n=el; while(n.parentElement){d++;n=n.parentElement;} return d; }

    function scoreEl(el, kw) {
        var score=0,t=(el.textContent||'').toLowerCase(),cls=(el.className||'')+(el.id||''),tag=el.tagName||'',alt=(el.getAttribute('alt')||el.getAttribute('aria-label')||'').toLowerCase(),href=(el.getAttribute('href')||'').toLowerCase(),da=el.getAttribute('data-name')||el.getAttribute('data-title')||el.getAttribute('data-label')||'',mc=0,tm=0;
        for (var i=0;i<kw.length;i++){var k=kw[i];if(t.includes(k)){tm++;score+=10;if(t.indexOf(k)<60)score+=5;var re=new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');var cnt=(t.match(re)||[]).length;if(cnt>1)score+=cnt*2;} if(alt.includes(k)){score+=18;tm++;} if((el.getAttribute('title')||'').toLowerCase().includes(k)){score+=14;tm++;} if(cls.includes(k))score+=8; if(da.toLowerCase().includes(k)){score+=16;tm++;} if(href.includes(k)){score+=6;tm++;}}
        var tw=t.split(/\s+/).length; if(tw>0&&tw<60){var d=tm/tw;if(d>0.15)score+=15;if(d>0.3)score+=20;}
        if(/content|item|card|article|section/.test(cls))score+=6; if(/title|heading|name|label/.test(cls))score+=6; if(/image|img|รูป|photo/.test(cls))score+=4; if(tag==='A'||tag==='BUTTON')score+=5;
        if(['A','BUTTON'].indexOf(tag)!==-1)score+=4; if(['H1','H2','H3','H4'].indexOf(tag)!==-1)score+=5; if(['IMG'].indexOf(tag)!==-1)score+=3;
        var rect=el.getBoundingClientRect(); if(rect.width>50&&rect.height>20)score+=3; if(rect.width<15||rect.height<5)score-=15; if(rect.width===0||rect.height===0)return-1; if(el.children.length===0&&!el.textContent.trim())score-=25;
        var st=window.getComputedStyle(el); if(st.display==='none'||st.visibility==='hidden'||st.opacity==='0')return-1; if(['SCRIPT','STYLE','NOSCRIPT','META','LINK','SVG','PATH','HEAD'].indexOf(tag)!==-1)return-1;
        return score;
    }

    function findContainer(el) {
        if(!el)return null; var c=el.closest('article,section,li,p,td,th,[class*="content"],[class*="result"],[class*="item"],[class*="entry"],[class*="card"],[class*="grid"],[class*="list"],blockquote,[class*="container"],[class*="wrapper"]');
        if(c){var ch=c.querySelectorAll(':scope > *');if(ch.length>=1&&ch.length<25)return c;} var ch2=el.querySelectorAll(':scope > *');if(ch2.length>1&&ch2.length<20)return el; return el.parentElement&&el.parentElement.children.length<=8?el.parentElement:el;
    }

    function warpEl(el) {
        if(!el)return;
        if (interceptSyntheticEvent(el, { type: "warp", targetText: el.textContent.slice(0, 50) }, _st ? _st.locale : "en")) return;
        var ov=document.createElement('div'); ov.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:2147482000;opacity:0;transition:opacity 0.5s ease;pointer-events:none;'; document.body.appendChild(ov);
        var orig={zIndex:el.style.zIndex,position:el.style.position,boxShadow:el.style.boxShadow,transition:el.style.transition,bg:el.style.backgroundColor};
        if(getComputedStyle(el).position==='static')el.style.position='relative'; el.style.zIndex='2147482001';el.style.transition='all 0.5s ease'; el.scrollIntoView({behavior:"smooth",block:"center"});
        setTimeout(function(){ov.style.opacity='1';el.style.boxShadow='0 0 40px 10px rgba(59,130,246,0.8),0 0 80px 20px rgba(20,184,166,0.6)';el.style.backgroundColor=getComputedStyle(el).backgroundColor==='rgba(0,0,0,0)'?'#ffffff':el.style.backgroundColor; var tip=document.createElement('div'); tip.style.cssText='position:absolute;top:-60px;left:50%;transform:translateX(-50%) translateY(20px);background:linear-gradient(135deg,#2563eb,#14b8a6);color:white;padding:10px 16px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.2);font-family:Arial,sans-serif;font-size:14px;text-align:center;white-space:nowrap;opacity:0;transition:all 0.4s cubic-bezier(0.175,0.885,0.32,1.275);pointer-events:none;z-index:2147482002;'; tip.innerHTML='\uD83D\uDCCD <strong>เจอแล้ว!</strong><br><small>นี่คือสิ่งที่คุณต้องการ</small>'; var ptr=document.createElement('div'); ptr.style.cssText='position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);border-width:8px 8px 0;border-style:solid;border-color:#1a8cae transparent transparent transparent;'; tip.appendChild(ptr); el.appendChild(tip);
        setTimeout(function(){tip.style.opacity='1';tip.style.transform='translateX(-50%) translateY(0)';},100); setTimeout(function(){ov.style.opacity='0';el.style.boxShadow=orig.boxShadow;tip.style.opacity='0';tip.style.transform='translateX(-50%) translateY(-10px)';setTimeout(function(){ov.remove();tip.remove();el.style.zIndex=orig.zIndex;el.style.position=orig.position;el.style.transition=orig.transition;el.style.backgroundColor=orig.bg;},500);},4000);},500);
    }

    function findEl(targetText, extraKw) {
        var kw = (targetText + ' ' + (extraKw||'')).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(function(w){return w.length>1;}).slice(0,20); if(!kw.length)return null;
        var sel=['h1','h2','h3','h4','a[href]','p','li','td','th','[class*="title"]','[class*="heading"]','[class*="item"]','[class*="content"]','article','section','[class*="card"]','[class*="entry"]']; var best=null,bestSc=0;
        for(var si=0;si<sel.length;si++){try{var els=document.querySelectorAll(sel[si]);for(var ci=0;ci<els.length;ci++){var el=els[ci];if(!safeEl(el))continue;var t=(el.textContent||'').toLowerCase(),mc=0;for(var ki=0;ki<kw.length;ki++){if(t.includes(kw[ki]))mc++;} if(mc>bestSc){bestSc=mc;best=el;}}}catch(_){}}
        if(best&&bestSc>=Math.ceil(kw.length*0.6))return findContainer(best);
        var cand=[]; var all=document.body.querySelectorAll('*'); for(var ei=0;ei<all.length;ei++){var e2=all[ei];if(!safeEl(e2))continue;var sc=scoreEl(e2,kw);if(sc>0)cand.push({el:e2,score:sc,depth:depth(e2)});}
        cand.sort(function(a,b){if(a.score!==b.score)return b.score-a.score;return a.depth-b.depth;}); var b=cand[0]; if(!b||b.score<Math.ceil(kw.length*0.5))return null; var con=findContainer(b.el);
        if(con){var ct=(con.textContent||'').toLowerCase(),vc=0;for(var ki2=0;ki2<kw.length;ki2++){if(ct.includes(kw[ki2]))vc++;} if(vc<Math.ceil(kw.length*0.4))return null;} return con;
    }

    function execAction(act) {
        if (!act || !act.type) return;
        var handle = function () {
            switch (act.type) {
                case "plugin_action":
                    if (!act.pluginName) return;
                    var plugin = window.SupremeBoost.plugins[act.pluginName];
                    if (plugin && typeof plugin.execute === 'function') {
                        plugin.execute(act.payload || {}, { locale: _st ? _st.locale : "en", addMessage: function(msg) { addMsg(_msgs, "assistant", msg); } });
                    } else {
                        console.warn("[SupremeBoost] Plugin not found or not executable:", act.pluginName);
                    }
                    break;
                case "handoff":
                    triggerHandoff(_st ? _st.locale : "en", "User requested human agent via chat.");
                    break;
                case "warp": if (!act.targetText) return; var t = findEl(act.targetText, act.keywords || []); if (t) { warpEl(t); } else if (_st && _cfg && _msgs) { var kw = (act.keywords || []).length ? act.keywords : act.targetText.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(function(w){return w.length>1;}).slice(0,10); crossSearch(kw,_cfg,_msgs,_st.locale).then(function(r){if(r&&r.length){var a=Array.from(new Set([act.targetText].concat(kw))).join(',');if(r[0].score>0){navigate(r[0].url,a,_msgs,_st.locale);}else{showCross(r,_msgs,a,_st.locale);}}else{addMsg(_msgs,"assistant","🔍 ไม่พบข้อมูลที่ต้องการในเว็บไซต์นี้");}}); } break;
                case "warp_cross_page": 
                    if (act.url) {
                        var kw = act.keywords || [];
                        var ro = document.getElementById(WIDGET_ID);
                        if(ro && ro.shadowRoot) {
                            var p = ro.shadowRoot.querySelector(".sb-panel");
                            if(p) {
                                var msg = document.createElement("div");
                                msg.className = "sb-msg sb-assistant";
                                msg.innerHTML = "🚀 <strong>Telekinesis Warp Initiated!</strong><br><small>กำลังพาคุณวาร์ปไปหน้าเป้าหมาย...</small>";
                                var msgs = p.querySelector(".sb-messages");
                                if(msgs) { msgs.appendChild(msg); msgs.scrollTop = msgs.scrollHeight; }
                            }
                        }
                        // Telekinesis Visual Effect
                        document.body.style.transition = "transform 0.8s cubic-bezier(0.5, 0, 0.2, 1), filter 0.8s ease";
                        document.body.style.transform = "scale(1.05)";
                        document.body.style.filter = "blur(10px) brightness(1.5)";
                        setTimeout(function(){
                            var sep = act.url.indexOf('?') !== -1 ? '&' : '?';
                            window.location.href = act.url + sep + 'sb-warp=1&sb-kw=' + encodeURIComponent(kw.join(','));
                        }, 800);
                    }
                    break;
                case "disable_widget":
                    // Kill Switch Enforcement
                    var widgetRoot = document.getElementById(WIDGET_ID);
                    if(widgetRoot) {
                        widgetRoot.style.pointerEvents = "none";
                        widgetRoot.style.filter = "grayscale(100%) opacity(0.5)";
                        var shadow = widgetRoot.shadowRoot;
                        if(shadow) {
                            var orb = shadow.querySelector(".sb-orb");
                            if(orb) {
                                orb.style.background = "#64748b";
                                orb.style.animation = "none";
                                orb.style.boxShadow = "none";
                            }
                            var panel = shadow.querySelector(".sb-panel");
                            if(panel) panel.style.display = "none";
                        }
                        if(window.Whisper) Whisper.hide();
                        console.warn("[INDICATOR WEB CHAT] Widget Disabled: SaaS License Validation Failed.");
                    }
                    break;
                case "confetti": loadScript("https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js",function(){if(window.confetti)window.confetti({particleCount:150,spread:80,origin:{y:0.6},zIndex:2147483647});}); break;
                case "highlight": if(act.selector){var el=document.querySelector(act.selector);if(el){if(interceptSyntheticEvent(el, act, _st ? _st.locale : "en")) return; var o=el.style.outline; var ot=el.style.transition;el.style.transition="outline 0.3s ease";el.style.outline="4px solid #facc15";el.style.outlineOffset="4px";setTimeout(function(){el.style.outline="4px solid transparent";setTimeout(function(){el.style.outline=o;el.style.transition=ot;},300);},1500);el.scrollIntoView({behavior:"smooth",block:"center"});}} break;
                case "speech": if(act.text&&window.speechSynthesis){var u=new SpeechSynthesisUtterance(act.text);var lang=detectLocale();u.lang=lang==="th"?"th-TH":lang==="ja"?"ja-JP":lang==="zh"?"zh-CN":"en-US";window.speechSynthesis.speak(u);} break;
                case "inject_html": if(act.html&&act.containerSelector){var c=document.querySelector(act.containerSelector);if(c){if(interceptSyntheticEvent(c, act, _st ? _st.locale : "en")) return; c.insertAdjacentHTML('beforeend',act.html);}} break;
            }
        };
        if (!safetyShield(act, _st ? _st.locale : "en", handle, function () { if (_msgs) addMsg(_msgs, "assistant", "⛔ " + t(_st ? _st.locale : "en", "safetyDeny")); })) { return; }
        handle();
    }

    function showConfirm(act,loc,onYes,onNo){var ro=document.getElementById(WIDGET_ID);if(!ro||!ro.shadowRoot)return;var p=ro.shadowRoot.querySelector(".sb-panel");if(!p)return;ensureConfirmStyle(ro.shadowRoot);var ex=p.querySelector(".sb-confirm-overlay");if(ex)ex.remove();var s=t(loc),desc=act.targetText||act.selector||act.type||"";var ov=document.createElement("div");ov.className="sb-confirm-overlay";ov.innerHTML='<div class="sb-confirm-box"><div class="sb-confirm-title">⚠️ '+s.confirmTitle+'</div><div class="sb-confirm-body"><p>'+s.confirmBody+'</p>'+(act.safetyReason?'<p style="color:#dc2626;font-size:12px;margin-top:4px;">'+escHtml(act.safetyReason)+'</p>':'')+'<p style="margin-top:6px;font-family:monospace;font-size:12px;background:#f8fafc;padding:8px;border-radius:8px;word-break:break-all;">'+escHtml(desc.slice(0,200))+'</p></div><div class="sb-confirm-actions"><button class="sb-confirm-btn sb-confirm-deny" data-action="deny">'+s.confirmDeny+'</button><button class="sb-confirm-btn sb-confirm-allow" data-action="allow">'+s.confirmAllow+'</button></div></div>';p.appendChild(ov);ov.querySelector('[data-action="deny"]').addEventListener("click",function(){ov.remove();if(onNo)onNo();});ov.querySelector('[data-action="allow"]').addEventListener("click",function(){ov.remove();if(onYes)onYes();});}
    function ensureConfirmStyle(shadow){var s=shadow.querySelector("#"+CONFIRM_STYLE_ID);if(s)return;var st=document.createElement("style");st.id=CONFIRM_STYLE_ID;st.textContent=".sb-confirm-overlay{position:absolute;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-radius:16px;animation:sbFadeIn 0.2s ease;}.sb-confirm-box{width:88%;max-width:320px;padding:20px;background:rgba(255,255,255,0.95);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-radius:16px;border:1px solid rgba(255,255,255,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.25);animation:sbSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1);}.sb-confirm-title{font:700 15px/1.2 Arial,sans-serif;margin-bottom:8px;color:#dc2626;}.sb-confirm-body{font:13px/1.5 Arial,sans-serif;color:#475569;margin-bottom:16px;}.sb-confirm-actions{display:flex;gap:10px;justify-content:flex-end;}.sb-confirm-btn{padding:9px 20px;border-radius:10px;border:0;font:600 14px/1 Arial,sans-serif;cursor:pointer;transition:transform 0.2s ease;}.sb-confirm-btn:hover{transform:scale(1.04);}.sb-confirm-allow{background:#dc2626;color:#fff;}.sb-confirm-deny{background:#f1f5f9;color:#475569;}@keyframes sbFadeIn{from{opacity:0}to{opacity:1}}@keyframes sbSlideUp{from{opacity:0;transform:translateY(20px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}";var firstStyle=shadow.querySelector("style");if(firstStyle)firstStyle.insertAdjacentElement("afterend",st);else shadow.insertBefore(st,shadow.firstChild);}

    function crossSearch(kw,cfg,m,loc){var links=collectLinks();var strs=t(loc);var ld=addMsg(m,"assistant",strs.searchingPages||"🔍 กำลังค้นหา...",true);return fetch(cfg.backendUrl.replace('/api/chat','/api/crawl'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keywords:kw,urls:links,rootUrl:location.origin})}).then(function(r){return r.json();}).then(function(d){updateMsg(ld,'');return(d.results||[]).slice(0,5);}).catch(function(){updateMsg(ld,strs.connectError);return[];});}
    function showCross(r,m,kw,loc){if(!r.length)return;var s=t(loc);var rm=document.createElement('div');rm.className='sb-msg sb-assistant';rm.innerHTML='<strong>'+(s.foundOnOtherPages||'✨ เจอบนหน้านี้:')+'</strong>';m.appendChild(rm);r.forEach(function(rr){var b=document.createElement('button');b.type='button';b.style.cssText='display:block;width:100%;text-align:left;padding:10px 14px;margin:6px 0;border:1px solid var(--sb-border);border-radius:10px;background:var(--sb-bg);color:var(--sb-text);font-size:13px;cursor:pointer;transition:all 0.25s cubic-bezier(0.34,1.56,0.64,1);';b.innerHTML='<strong>\uD83D\uDCC4 '+escHtml(rr.title)+'</strong><br><small style="color:var(--sb-muted)">'+escHtml(rr.snippet.slice(0,120))+'...</small>';b.onmouseenter=function(){b.style.borderColor='var(--sb-primary)';b.style.transform='translateX(4px) scale(1.01)';};b.onmouseleave=function(){b.style.borderColor='var(--sb-border)';b.style.transform='none';};b.onclick=function(){navigate(rr.url,kw,m,loc);};m.appendChild(b);});m.scrollTop=m.scrollHeight;}
    function navigate(url,kw,m,loc){addMsg(m,"assistant","\uD83D\uDCCD กำลังพาวาร์ปไปที่: "+(url.split('/').pop()||url)+"...");document.body.style.transition="transform 0.8s cubic-bezier(0.5,0,0.2,1)";document.body.style.transform="scale(1.05)";setTimeout(function(){var sep=url.indexOf('?')!==-1?'&':'?';window.location.href=url+sep+'sb-warp=1&sb-kw='+encodeURIComponent(kw||'');},800);}
    function collectLinks(){var l=[],s=new Set(),c=location.origin;document.querySelectorAll('a[href]').forEach(function(a){try{var u=new URL(a.href,document.baseURI);if(u.origin===c&&u.pathname!==location.pathname&&!u.hash&&!s.has(u.pathname)){if(!/(admin|login|password|secure|backend|dashboard|checkout|auth)/i.test(u.pathname)){s.add(u.pathname);l.push(u.href);}}}catch(_){}});return l.slice(0,30);}
    function escHtml(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
    function handlePostWarp(){var p=new URLSearchParams(location.search),w=p.get('sb-warp');if(!w)return;var kw=(p.get('sb-kw')||'').split(',').filter(Boolean);if(!kw.length)return;var at=0,ma=15;var fn=function(){at++;var f=findEl(kw.join(' '),kw);if(f){history.replaceState(null,'',location.pathname+location.hash);var ov=document.createElement('div');ov.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:2147482000;opacity:0;transition:opacity 0.5s ease;pointer-events:none;';document.body.appendChild(ov);f.style.transition='all 0.5s ease';f.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(function(){ov.style.opacity='1';f.style.boxShadow='0 0 40px 10px rgba(59,130,246,0.8),0 0 80px 20px rgba(20,184,166,0.6)';setTimeout(function(){ov.style.opacity='0';setTimeout(function(){ov.remove();},500);},3000);},500);}else if(at<ma)setTimeout(fn,600);};fn();}
    function loadScript(src,cb){if(document.querySelector('script[src="'+src+'"]')){if(cb)cb();return;}var s=document.createElement("script");s.src=src;s.onload=cb;document.head.appendChild(s);}
    function localReply(prompt,loc){var q=String(prompt||"").toLowerCase(),pc=collectContent(),s=t(loc);if(!pc)return"";if(!/(อะไร|อะไร|มี|หา|about|what|find|where|search|content|เกี่ยวกับ)/i.test(q))return"";var ch=[];var src=pc;var sentences=src.split(/[.!?]\s+/).filter(function(s){return s.trim().length>20;}).slice(0,8);var kw=q.replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(function(w){return w.length>2;});var mt=sentences.filter(function(c){return kw.some(function(w){return c.toLowerCase().includes(w);});}).slice(0,3);var lines=mt.length?mt:sentences.slice(0,3);if(!lines.length)return"";return s.fallbackIntro+"\n\n"+lines.map(function(l){return "- "+l.trim();}).join("\n");}
    function collectContent(){var c=document.body.cloneNode(true);var w=c.querySelector("#"+WIDGET_ID);if(w)w.remove();c.querySelectorAll("script,style,noscript,svg").forEach(function(n){n.remove();});return c.textContent.replace(/\s+/g," ").trim().slice(0,MAX_PAGE_CHARS);}
    function safeCss(css){if(!css||typeof css!=="string")return false;var t=css.trim();if(!t||t.length>5000)return false;return !/(<|>|@import|url\s*\(|javascript:|expression\s*\(|filter:|blur\()/i.test(t);}
    function ensureStyle(shadow){var root=shadow||document.getElementById(WIDGET_ID)?.shadowRoot||document;var s=root.getElementById?.(ADAPTIVE_STYLE_ID)||root.querySelector?.("#"+ADAPTIVE_STYLE_ID);if(!s){s=document.createElement("style");s.id=ADAPTIVE_STYLE_ID;var target=root===document?document.head:root;if(target.appendChild)target.appendChild(s);else if(root.firstChild)root.insertBefore(s,root.firstChild);}return s;}

    function buildShadowStyles(cfg) {
        var side = cfg.position === "left" ? "left" : "right";
        var opp = side === "left" ? "right" : "left";
        var pri = cfg.primary;
        return [
            "@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');",
            ":host{--ai-primary:" + pri + ";--ai-glow:color-mix(in srgb,#ec4899 50%,transparent);--ai-soft:color-mix(in srgb,#8b5cf6 25%,transparent);--ai-glass:rgba(15,10,30,0.75);--ai-glass-b:rgba(139,92,246,0.4);--ai-bg:rgba(15,10,30,0.75);--ai-text:#f8fafc;--ai-muted:#94a3b8;--ai-border:rgba(139,92,246,0.4);--ai-blur:24px;--ai-r:16px;--ai-orb:52px;--ai-ease:cubic-bezier(0.34,1.56,0.64,1);--ai-ease-out:cubic-bezier(0.22,1,0.36,1);--ai-neon:0 0 10px var(--ai-glow),0 0 20px var(--ai-soft),0 0 40px color-mix(in srgb," + pri + " 30%,transparent),inset 0 0 15px rgba(139,92,246,0.2);all:initial;display:block;position:fixed;" + side + ":clamp(8px,2vw,24px);bottom:clamp(8px,2vw,24px);z-index:2147483647;font-family:Arial,'Noto Sans Thai',sans-serif;color:var(--ai-text);line-height:1.4;contain:layout style;overflow:visible;isolation:isolate;}",
            ".sb-orb{position:absolute;bottom:0;" + side + ":0;width:var(--ai-orb);height:var(--ai-orb);border:0;border-radius:50%;background:conic-gradient(from 0deg, #8b5cf6, #ec4899, #3b82f6, #8b5cf6);background-size:200%200%;cursor:pointer;z-index:10;font:800 18px/1 Arial,sans-serif;color:#fff;box-shadow:var(--ai-neon);animation:sbShimmer 4s linear infinite;transition:all 0.5s var(--ai-ease);display:grid;place-items:center;will-change:transform,opacity;pointer-events:auto;}",
            ".sb-orb::before{content:'';position:absolute;inset:-4px;border-radius:50%;background:conic-gradient(from 180deg, #ec4899, #3b82f6, #8b5cf6, #ec4899);opacity:0.6;filter:blur(8px);z-index:-1;transition:all 0.5s var(--ai-ease);}",
            ".sb-orb::after{content:'AI';transition:all 0.4s var(--ai-ease);}",
            ":host(.sb-orb-watching) .sb-orb{animation:sbPulseRing 1.5s ease-in-out infinite,sbShimmer 4s ease-in-out infinite;box-shadow:var(--ai-neon),0 0 0 8px var(--ai-soft);}",
            ":host(.sb-orb-watching) .sb-orb::before{opacity:1;}",
            ":host(.sb-brain-groq) .sb-orb{box-shadow:0 0 15px #3b82f6,0 0 30px rgba(59,130,246,0.4);animation:sbFastPulse 0.6s ease-in-out infinite;}",
            ":host(.sb-brain-cohere) .sb-orb{box-shadow:0 0 15px #10b981,0 0 30px rgba(16,185,129,0.4);animation:sbSafetyPulse 1s ease-in-out infinite;}",
            ":host(.sb-brain-gemini) .sb-orb{box-shadow:0 0 15px #8b5cf6,0 0 30px rgba(139,92,246,0.4);animation:sbCreativePulse 1.2s ease-in-out infinite;}",
            ":host(.sb-expanded) .sb-orb{width:clamp(28px,4vw,36px);height:clamp(28px,4vw,36px);border-radius:8px;position:fixed;" + side + ":clamp(8px,2vw,24px);bottom:auto;top:clamp(8px,2vw,24px);animation:none!important;box-shadow:0 2px 10px var(--ai-glow);font-size:12px;background:rgba(255,255,255,0.25);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);z-index:2147483647;}",
            ":host(.sb-expanded) .sb-orb::after{content:'\u00D7';font-size:clamp(14px,2.5vw,20px);}",
            ":host(.sb-expanded) .sb-orb::before{display:none;}",
            ".sb-whisper-container{position:fixed;bottom:clamp(96px,16vw,130px);" + side + ":clamp(8px,2vw,24px);z-index:2147483646;pointer-events:auto;display:none;max-width:min(360px,85vw);transition:bottom 0.4s var(--ai-ease-out);}",
            ":host(.sb-shelf-open) .sb-whisper-container{bottom:clamp(224px,22vw,250px)!important;}",
            ":host(.sb-iw-open) .sb-whisper-container{bottom:clamp(96px,16vw,130px)!important;}",

            ".sb-i-wrap{background:var(--ai-bg);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border-radius:14px;border:1px solid var(--ai-glass-b);box-shadow:0 12px 40px rgba(0,0,0,0.4),var(--ai-neon);padding:clamp(8px,1.5vw,14px);animation:sbSlideUp 0.3s var(--ai-ease);}",
            ".sb-i-title{font:600 clamp(12px,1.5vw,14px)/1.2 Arial,sans-serif;margin-bottom:8px;color:var(--ai-text);}",
            ".sb-i-track{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}",
            ".sb-i-track::-webkit-scrollbar{display:none;}",
            ".sb-i-card{flex:0 0 auto;width:110px;padding:8px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid var(--ai-glass-b);cursor:pointer;transition:all 0.25s ease;}",
            ".sb-i-card:hover{transform:translateY(-2px);box-shadow:0 0 15px var(--ai-glow);background:rgba(255,255,255,0.1);}",
            ".sb-i-slider-wrap{position:relative;height:40px;background:rgba(0,0,0,0.2);border-radius:20px;overflow:hidden;cursor:pointer;margin-top:4px;border:1px solid var(--ai-glass-b);}",
            ".sb-i-slider-bg{position:absolute;top:0;left:0;height:100%;background:linear-gradient(135deg," + pri + ",#8b5cf6);border-radius:20px;width:0%;transition:width 0.05s linear;}",
            ".sb-i-slider-thumb{position:absolute;top:2px;left:2px;width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:0 0 15px var(--ai-glow);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:grab;z-index:2;color:#8b5cf6;}",
            ".sb-i-slider-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font:500 12px/1 Arial,sans-serif;color:var(--ai-muted);z-index:1;pointer-events:none;transition:opacity 0.3s ease;}",
            ".sb-i-options{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}",
            ".sb-i-opt-btn{padding:clamp(6px,1vw,10px) clamp(10px,1.5vw,16px);border:1px solid var(--ai-glass-b);border-radius:20px;background:rgba(255,255,255,0.05);color:var(--ai-text);font:clamp(11px,1.3vw,13px)/1 Arial,sans-serif;cursor:pointer;transition:all 0.2s ease;}",
            ".sb-i-opt-btn:hover{background:rgba(139,92,246,0.3);color:#fff;border-color:#ec4899;transform:scale(1.04);box-shadow:0 0 15px var(--ai-glow);}",
            ".sb-panel{position:fixed;bottom:clamp(56px,8vh,72px);" + side + ":clamp(8px,2vw,24px);width:min(400px,calc(100vw - 32px));max-width:90vw;height:min(600px,calc(100vh - 96px));max-height:85vh;display:none;flex-direction:column;background:var(--ai-bg);-webkit-backdrop-filter:blur(var(--ai-blur));backdrop-filter:blur(var(--ai-blur));border:1px solid var(--ai-glass-b);border-radius:var(--ai-r);box-shadow:0 30px 80px rgba(15,23,42,0.15),inset 0 0 0 1px rgba(255,255,255,0.3);transform:translateY(30px) scale(0.9);opacity:0;transform-origin:bottom " + side + ";transition:transform 0.4s var(--ai-ease),opacity 0.3s ease;pointer-events:none;z-index:2147483646;contain:layout style;}",
            ":host(.sb-open) .sb-panel{display:flex;transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}",
            ".sb-header{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:clamp(12px,2vw,18px) clamp(14px,2vw,20px) clamp(10px,1.5vw,14px);color:#fff;background:linear-gradient(135deg,rgba(37,99,235,0.95),rgba(20,184,166,0.95));background-size:200%200%;animation:sbShimmer 4s ease-in-out infinite;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,0.1);border-radius:var(--ai-r) var(--ai-r) 0 0;}",
            ".sb-title{font:700 clamp(14px,2vw,17px)/1.2 Arial,sans-serif;}",
            ".sb-subtitle{margin-top:2px;font:clamp(11px,1.3vw,13px)/1.3 Arial,sans-serif;opacity:0.88;}",
            ".sb-actions{display:flex;gap:6px;flex-shrink:0;}",
            ".sb-icon-btn{width:clamp(28px,4vw,34px);height:clamp(28px,4vw,34px);display:inline-grid;place-items:center;border:1px solid rgba(255,255,255,0.35);border-radius:8px;background:rgba(255,255,255,0.16);color:#fff;cursor:pointer;font:clamp(14px,2.5vw,18px)/1 Arial,sans-serif;transition:all 0.25s ease;}",
            ".sb-icon-btn:hover{background:rgba(255,255,255,0.28);transform:scale(1.12);}",
            ".sb-messages{flex:1;display:flex;flex-direction:column;gap:clamp(8px,1.2vw,12px);padding:clamp(12px,2vw,18px);overflow:auto;background:transparent;min-height:0;}",
            ".sb-msg{max-width:88%;padding:clamp(10px,1.5vw,14px) clamp(12px,2vw,16px);border-radius:16px;font:clamp(13px,1.6vw,15px)/1.6 Arial,sans-serif;white-space:pre-wrap;word-break:break-word;}",
            ".sb-user{align-self:flex-end;color:#fff;background:linear-gradient(135deg,var(--ai-primary),#8b5cf6);border-bottom-right-radius:4px;animation:sbSlideInRight 0.35s var(--ai-ease);}",
            ".sb-assistant{align-self:flex-start;color:var(--ai-text);background:rgba(255,255,255,0.08);border:1px solid var(--ai-glass-b);border-bottom-left-radius:4px;animation:sbSlideInLeft 0.35s var(--ai-ease);box-shadow:var(--ai-neon);}",
            ".sb-loading::after{content:'.';display:inline-block;width:1.1em;text-align:left;animation:sbDots 1.4s steps(4,end) infinite;}",
            ".sb-loading{animation:sbLoadingBounce 0.6s ease-in-out infinite alternate!important;}",
            ".sb-handoff{max-width:100%!important;}",
            ".sb-quick{display:flex;gap:6px;padding:clamp(8px,1.2vw,12px) clamp(10px,1.5vw,14px);overflow-x:auto;border-top:1px solid var(--ai-glass-b);background:rgba(0,0,0,0.2);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);flex-shrink:0;}",
            ".sb-chip{flex:0 0 auto;border:1px solid var(--ai-glass-b);border-radius:999px;background:rgba(255,255,255,0.05);color:var(--ai-text);padding:clamp(6px,1vw,10px) clamp(10px,1.5vw,14px);font:clamp(12px,1.4vw,14px)/1 Arial,sans-serif;cursor:pointer;transition:all 0.25s ease;white-space:nowrap;}",
            ".sb-chip:hover{background:rgba(139,92,246,0.3);border-color:#ec4899;transform:translateY(-1px) scale(1.04);box-shadow:0 0 15px var(--ai-glow);}",
            ".sb-compose{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;padding:clamp(10px,1.5vw,14px);border-top:1px solid var(--ai-glass-b);background:rgba(0,0,0,0.2);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-radius:0 0 var(--ai-r) var(--ai-r);flex-shrink:0;}",
            ".sb-input{min-height:44px;max-height:120px;resize:none;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 14px;outline:none;color:var(--ai-text);background:rgba(0,0,0,0.3);font:clamp(13px,1.6vw,15px)/1.4 Arial,sans-serif;transition:all 0.2s ease;}",
            ".sb-input:focus{border-color:var(--ai-primary);background:#fff;color:#1e293b;box-shadow:0 0 0 3px var(--ai-soft);}",
            ".sb-send{min-height:44px;border:0;border-radius:12px;padding:0 clamp(12px,2vw,18px);color:#fff;background:linear-gradient(135deg,var(--ai-primary),#3b82f6);font-weight:700;cursor:pointer;box-shadow:0 4px 12px var(--ai-glow);transition:transform 0.2s var(--ai-ease);font:700 clamp(13px,1.6vw,15px)/1 Arial,sans-serif;}",
            ".sb-send:hover{transform:scale(1.04);}",
            ":host(.sb-busy) .sb-send{opacity:0.65;cursor:wait;}",
            ":host(.sb-nudge) .sb-orb{animation:sbPulse 1.5s ease-in-out 3,sbShimmer 4s ease-in-out infinite;}",
            "@keyframes sbSlideInRight{from{opacity:0;transform:translateX(30px) scale(0.92)}to{opacity:1;transform:translateX(0) scale(1)}}",
            "@keyframes sbSlideInLeft{from{opacity:0;transform:translateX(-30px) scale(0.92)}to{opacity:1;transform:translateX(0) scale(1)}}",
            "@keyframes sbPulse{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-4px) scale(1.04)}}",
            "@keyframes sbPulseRing{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.15);opacity:0.3}}",
            "@keyframes sbShimmer{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}",
            "@keyframes sbDots{0%{content:'.'}33%{content:'..'}66%,100%{content:'...'}}",
            "@keyframes sbLoadingBounce{from{transform:translateY(0)}to{transform:translateY(-3px)}}",
            "@keyframes sbFastPulse{0%,100%{transform:scale(1);box-shadow:0 0 10px #3b82f6,0 0 20px rgba(59,130,246,0.3)}50%{transform:scale(1.06);box-shadow:0 0 20px #3b82f6,0 0 40px rgba(59,130,246,0.5)}}",
            "@keyframes sbSafetyPulse{0%,100%{transform:scale(1);box-shadow:0 0 10px #10b981,0 0 20px rgba(16,185,129,0.3)}50%{transform:scale(1.04);box-shadow:0 0 20px #10b981,0 0 40px rgba(16,185,129,0.5)}}",
            "@keyframes sbCreativePulse{0%,100%{transform:scale(1);box-shadow:0 0 10px #8b5cf6,0 0 20px rgba(139,92,246,0.3)}50%{transform:scale(1.08);box-shadow:0 0 20px #8b5cf6,0 0 40px rgba(139,92,246,0.5)}}",
            "@keyframes sbFloatWord{to{opacity:1;transform:translateY(0) scale(1);text-shadow:0 0 14px rgba(200,180,255,0.9),0 0 30px rgba(139,92,246,0.6);color:#fff;}}",
            "@keyframes sbHoloBorder{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}",
            "@media(max-width:480px){.sb-panel{width:calc(100vw - 16px);max-width:100%;left:8px;right:8px;height:min(85vh,calc(100vh - 80px));bottom:8px;}.sb-whisper{max-width:85vw;}.sb-whisper-container{max-width:85vw;}}"
        ].join("\n");
    }

    function injectStyle(cfg) {
        if (document.getElementById(STYLE_ID)) return;
        var s = document.createElement("style");
        s.id = STYLE_ID;
        s.textContent = [
            "#" + WIDGET_ID + "{position:fixed;z-index:2147483647;contain:layout style;isolation:isolate;overflow:visible;pointer-events:none;}",
            "#" + WIDGET_ID + " .sb-glow-base{position:absolute;bottom:0;" + (cfg.position === "left" ? "left" : "right") + ":0;width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at center,var(--ai-glow, rgba(102,126,234,0.5)) 0%,transparent 70%);opacity:0.6;pointer-events:none;transition:all 0.6s cubic-bezier(0.22,1,0.36,1);z-index:1;}",
            "#" + WIDGET_ID + ".sb-expanded .sb-glow-base{opacity:0;transform:scale(3);}",
            "#" + WIDGET_ID + ".sb-nudge .sb-glow-base{opacity:1;animation:sbPulseRingHost 1.5s ease-in-out 3;}",
            "#" + WIDGET_ID + " .sb-aura{position:fixed;pointer-events:none;z-index:2147483645;border-radius:12px;box-shadow:0 0 30px var(--ai-glow, rgba(102,126,234,0.5)),inset 0 0 30px color-mix(in srgb,var(--ai-primary, #667eea) 25%,transparent),0 0 10px var(--ai-glow, rgba(102,126,234,0.5)),0 0 20px color-mix(in srgb,var(--ai-primary, #667eea) 25%,transparent),0 0 40px color-mix(in srgb,var(--ai-primary, #667eea) 10%,transparent);border:1px solid rgba(255,255,255,0.15);opacity:0;display:none;transition:opacity 0.6s cubic-bezier(0.22,1,0.36,1);}",
            "html.supreme-boost-dark-page body{background:#0f172a!important;color:#e5e7eb!important;}",
            "html.supreme-boost-large-text body>:not(#" + WIDGET_ID + "){font-size:118%!important;line-height:1.75!important;}",
            "html.supreme-boost-small-text body>:not(#" + WIDGET_ID + "){font-size:94%!important;}",
            "@keyframes sbPulseRingHost{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.15);opacity:0.3}}",
            ".sb-whisper{position:fixed;bottom:clamp(72px,12vw,90px);" + (cfg.position === 'left' ? 'left' : 'right') + ":clamp(8px,2vw,24px);min-width:min(280px,82vw);max-width:min(400px,85vw);padding:clamp(14px,2vw,20px) clamp(16px,2.5vw,24px);background:rgba(8,6,24,0.88);-webkit-backdrop-filter:blur(28px) saturate(180%);backdrop-filter:blur(28px) saturate(180%);border:1px solid rgba(139,92,246,0.6);border-radius:18px;box-shadow:0 0 0 1px rgba(236,72,153,0.15),0 12px 40px rgba(0,0,0,0.6),0 0 40px rgba(139,92,246,0.35),inset 0 0 20px rgba(139,92,246,0.08);font:clamp(14px,1.6vw,16px)/1.7 'Prompt',Arial,'Noto Sans Thai',sans-serif;color:#f8fafc;opacity:0;transform:translateY(10px) scale(0.95);pointer-events:auto;cursor:pointer;z-index:2147483647;transition:opacity 0.45s ease,transform 0.45s cubic-bezier(0.34,1.56,0.64,1);word-break:break-word;text-align:left;border-width:0;outline:none;}",
            ".sb-whisper-label{display:block;font:600 10px/1 Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:rgba(180,140,255,0.9);margin-bottom:10px;}",
            "@keyframes sbFloatWord{to{opacity:1;transform:translateY(0) scale(1);text-shadow:0 0 14px rgba(200,180,255,0.9),0 0 30px rgba(139,92,246,0.6);color:#fff;}}",
            "@keyframes sbHoloBorder{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}"
        ].join("\n");
        document.head.appendChild(s);
    }

    ready(function () { retry(function () { var c = getConfig(); injectStyle(c); return init(); }); });
})();
