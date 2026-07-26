const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, AlignmentType, WidthType, PageBreak } = require("docx");

function createHeader(text, level = HeadingLevel.HEADING_1) {
    return new Paragraph({ text: text, heading: level, spacing: { before: 400, after: 200 } });
}

function createText(text, bold = false) {
    return new Paragraph({
        children: [new TextRun({ text: text, bold: bold })],
        spacing: { after: 120, line: 360 }
    });
}

function createBullet(text) {
    return new Paragraph({
        text: text,
        bullet: { level: 0 },
        spacing: { after: 120, line: 360 }
    });
}

const doc = new Document({
    creator: "Antigravity Agent",
    title: "INDICATOR WEB CHAT - Master Technical Specification",
    description: "Detailed system architecture and workflow explanation",
    sections: [
        {
            properties: {},
            children: [
                new Paragraph({
                    text: "คู่มือสถาปัตยกรรมระบบ (System Architecture & Technical Specification)",
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 }
                }),
                new Paragraph({
                    text: "โครงการ: INDICATOR WEB CHAT (supreme-boost)",
                    heading: HeadingLevel.HEADING_2,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 }
                }),
                new Paragraph({
                    text: "เวอร์ชันระบบ: 3.0.0 (OMEGA-JARVIS) / Triple-Brain Matrix",
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 600 }
                }),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 1 ---
                createHeader("บทที่ 1: บทสรุปผู้บริหารและภาพรวมโครงการ (Executive Summary)", HeadingLevel.HEADING_1),
                createText("โปรเจค INDICATOR WEB CHAT (supreme-boost) เป็นระบบแชทบอท AI อัจฉริยะแบบฝังตัว (Embeddable Widget) ที่ออกแบบมาเพื่อใช้งานร่วมกับเว็บไซต์ E-Commerce, องค์กร หรือบล็อกทั่วไปได้อย่างไร้รอยต่อ โดยมีความสามารถพิเศษคือ 'การตระหนักรู้บริบท' (Context-Awareness) หมายความว่า AI ไม่ได้ตอบคำถามแบบหุ่นยนต์ทั่วไป แต่มันสามารถมองเห็นและอ่านเนื้อหาบนหน้าเว็บที่ผู้ใช้กำลังดูอยู่ได้แบบ Real-time"),
                createText("เป้าหมายหลักของระบบนี้คือการลดภาระแอดมิน (Human Agent) และเพิ่มประสบการณ์การใช้งานที่ลื่นไหลให้แก่ลูกค้า (Customer Experience) ผ่านเทคโนโลยี Multi-Agent AI (สมองกลหลายตัวช่วยกันทำงาน) ที่ถูกรันอยู่บนระบบ Serverless Architecture (Vercel) และเชื่อมต่อฐานข้อมูลความเร็วสูงอย่าง Supabase"),
                createHeader("คุณสมบัติหลักของระบบ (Key Features)", HeadingLevel.HEADING_2),
                createBullet("1. Auto-Context Extraction: ระบบอ่านเนื้อหา (Site DNA) อัตโนมัติจากหน้าเว็บ"),
                createBullet("2. Multi-Agent Orchestration: สมองกล LLM แบ่งหน้าที่กันทำงาน (Planner, Executor)"),
                createBullet("3. Behavioral Observer: ตรวจจับความหงุดหงิด (Frustration) และความลังเล (Hesitation) ของผู้ใช้งาน"),
                createBullet("4. 100% Uptime Guarantee: ระบบสลับ API Keys (Circuit Breaker) อัตโนมัติ 5 ตัว พร้อมระบบสำรอง Groq"),
                createBullet("5. CSS Injection Command: AI สามารถสั่งเปลี่ยนหน้าตาเว็บ (เช่น ขยายฟอนต์, เปิด Dark Mode) ได้เอง"),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 2 ---
                createHeader("บทที่ 2: สถาปัตยกรรมส่วนหน้า (Frontend & Widget Architecture)", HeadingLevel.HEADING_1),
                createText("ส่วนหน้าของระบบ (Frontend) ถูกพัฒนาด้วย Vanilla JavaScript ปราศจาก Framework ที่หนักหน่วง เพื่อให้สามารถฝัง (Embed) บนเว็บไซต์ใดๆ ก็ได้โดยไม่ส่งผลกระทบต่อความเร็วโหลดของเว็บไซต์ลูกค้า (Zero-Impact Footprint)"),
                createHeader("2.1 การทำงานของไฟล์ src/widget/main.js", HeadingLevel.HEADING_2),
                createText("โค้ดหลักถูกเขียนใน main.js และจะถูกรวบรวม (Bundle) และบีบอัด (Minify) ด้วย ESBuild ผ่านไฟล์ build.js ออกมาเป็น boost.js เพื่อให้พร้อมใช้งานบน Production"),
                createBullet("Shadow DOM Isolation: ระบบจะสร้าง <div id='supreme-boost-root'> และใช้ attachShadow({mode: 'open'}) เพื่อแยก CSS ของ Widget ออกจาก CSS ของเว็บไซต์หลัก ป้องกันปัญหาหน้าตาเว็บเพี้ยน (Style Bleeding)"),
                createBullet("Responsive Panel: หน้าต่างแชทสามารถปรับตัวตามขนาดหน้าจอ (Mobile-first) และลอยอยู่ด้านข้างจอภาพ (Positioning Options: Left/Right)"),
                createHeader("2.2 Behavioral Observer (สมองตรวจจับพฤติกรรม)", HeadingLevel.HEADING_2),
                createText("ระบบนี้จะถูกทำงานเบื้องหลัง (Background Worker) เพื่อประเมินว่าผู้ใช้ต้องการความช่วยเหลือหรือไม่:"),
                createBullet("- Hesitation (ความลังเล): หากเมาส์ของผู้ใช้ไปหยุดอยู่ที่สินค้านานเกิน HESITATION_MS (4 วินาที) ระบบจะดึง Text บริเวณนั้นส่งให้ AI ทันที เพื่อนำเสนอข้อความทักทายอัตโนมัติ (Proactive Whisper) เช่น 'สนใจสินค้านี้อยู่ใช่ไหม?'"),
                createBullet("- Rage Clicks (การคลิกด้วยความโกรธ): หากผู้ใช้คลิกรัวๆ มากกว่า 3 ครั้งในบริเวณเดิม (ภายใน 500ms และ รัศมี 30px) ระบบจะตรวจจับ Frustration และเปิดระบบ Hand-off (ติดต่อแอดมินมนุษย์) ทันทีเพื่อลดความหัวเสียของลูกค้า"),
                createBullet("- Confusion (การสับสนในการเลื่อนจอ): หากหน้าจอถูกเลื่อนขึ้นลงสลับไปมาเร็วๆ (CONFUSION_DIRECTION_CHANGES = 2 ครั้ง) ระบบจะรับรู้ว่าลูกค้าหาของไม่เจอ"),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 3 ---
                createHeader("บทที่ 3: ระบบการดึงข้อมูล Site DNA (Context Extraction Layer)", HeadingLevel.HEADING_1),
                createText("สิ่งที่ทำให้ INDICATOR ฉลาดกว่า ChatGPT ทั่วไปคือ มันมองเห็นหน้าเว็บแบบที่ผู้ใช้เห็น"),
                createHeader("3.1 กลไกการอ่านหน้าเว็บ (extractSiteDNA)", HeadingLevel.HEADING_2),
                createText("เมื่อมีการเรียกคำสั่ง extractSiteDNA() ระบบจะทำสิ่งต่อไปนี้:"),
                createBullet("- กวาดข้อมูล Meta Tags (Title, Description, Keywords) เพื่อให้ AI รู้ภาพรวมเว็บ"),
                createBullet("- รวบรวมหัวข้อ (Headings - H1, H2, H3) มากสุด 8 รายการแรก เพื่อดึงสาระสำคัญ"),
                createBullet("- ค้นหา Element สินค้า (Products/Entities) โดยหา Class ที่ชื่อว่า .product, .item, .card ดึงชื่อและราคา (Price) มาเก็บไว้สูงสุด 10 รายการ"),
                createBullet("- อ่านตาราง (Tables/Data) ดึงข้อมูล th, td เพื่อให้ตอบเรื่องเปรียบเทียบสเปคได้"),
                createBullet("- คำนวณจุดกึ่งกลางหน้าจอ (document.elementFromPoint) เพื่อหา Active Section ว่าผู้ใช้กำลังโฟกัสอยู่ตรงไหน ดึงข้อความรัศมี 1,000 ตัวอักษรส่งให้ AI"),
                
                createHeader("3.2 Safety Shield & PII Masking (ระบบรักษาความปลอดภัย)", HeadingLevel.HEADING_2),
                createText("เพื่อรักษาความปลอดภัยและความเป็นส่วนตัวของผู้ใช้ ข้อมูลทั้งหมดจะผ่านฟังก์ชัน maskPII() ก่อนส่งขึ้น Server:"),
                createBullet("- Email (REDACTED_EMAIL): ปิดบังอีเมลทั้งหมดด้วย Regex"),
                createBullet("- Credit Cards (REDACTED_CARD): ตรวจจับตัวเลข 13-16 หลักที่คล้ายบัตรเครดิต"),
                createBullet("- Phone Numbers (REDACTED_PHONE): ตรวจจับเบอร์โทรศัพท์ 10 หลัก"),
                createBullet("- Secret Keys (REDACTED_SECRET): ป้องกันไม่ให้ส่ง API Key หรือ Token ที่หลุดอยู่ในหน้าเว็บ"),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 4 ---
                createHeader("บทที่ 4: การประมวลผลเซิร์ฟเวอร์ (Backend & API Layer)", HeadingLevel.HEADING_1),
                createText("ระบบ API ถูกเขียนด้วย Node.js (api/chat.js) เพื่อให้พร้อมสำหรับการทำ Serverless บน Vercel หรือรันด้วย PM2 (server.js)"),
                createHeader("4.1 Request Validation & Tenant Check", HeadingLevel.HEADING_2),
                createText("เมื่อ Request เข้ามาที่ /api/chat ระบบจะเช็ค:"),
                createBullet("1. CORS (Cross-Origin Resource Sharing): อนุญาตให้ทุกโดเมนฝังสคริปต์ได้"),
                createBullet("2. API Key (Tenant ID): ระบบจะ Query ฐานข้อมูล (Supabase) ตาราง `tenants` เพื่อดึงข้อมูลลูกค้า เช็คว่าสถานะเป็น Suspended หรือ Package Expires_at หมดอายุหรือไม่ หากหมดอายุ ระบบจะ Block ทันทีและขึ้น Action: disable_widget"),
                
                createHeader("4.2 RAG (Retrieval-Augmented Generation)", HeadingLevel.HEADING_2),
                createText("หากระบบตรวจพบว่าผู้ใช้ตั้งคำถาม ระบบจะนำ Prompt นั้นไปผ่านกระบวนการ RAG (services/rag.js)"),
                createBullet("- นำ Prompt ไปแปลงเป็น Vector (Embedding) ด้วยโมเดล text-embedding-004 ของ Google"),
                createBullet("- ค้นหาข้อมูลความหมายใกล้เคียง (Semantic Search) ในฐานข้อมูลตาราง `knowledge_chunks` ด้วยฟังก์ชัน RPC match_knowledge_chunks (Cosine Similarity threshold 0.3)"),
                createBullet("- นำ Context ที่ได้ (สูงสุด 5 chunks) แปะเข้าไปใน System Prompt ให้ LLM อ่าน"),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 5 ---
                createHeader("บทที่ 5: สมองกลปัญญาประดิษฐ์ (Multi-Agent Orchestrator)", HeadingLevel.HEADING_1),
                createText("ศูนย์กลางของความฉลาดอยู่ที่ไฟล์ services/llm.js ที่ใช้สถาปัตยกรรมแบบ Multi-Agent"),
                createHeader("5.1 Circuit Breaker Pattern (ป้องกันระบบล่ม)", HeadingLevel.HEADING_2),
                createText("โมเดลหลักที่ใช้คือ gemini-2.5-flash ระบบถูกออกแบบมารองรับทราฟฟิกสูงด้วย API Keys 5 ชุด:"),
                createBullet("- GEMINI_API_KEY ถึง GEMINI_API_KEY_5"),
                createBullet("- หาก Key ไหนตอบสนองช้า หรือเกิด Error (HTTP 429 Too Many Requests), Circuit Breaker จะทำการ 'เปิดสับสวิตช์' (Open) และพักการใช้งาน Key นั้น (Cooldown) ด้วยสมการ Exponential Backoff (1000ms ไปจนถึง 60000ms)"),
                createBullet("- ระบบจะวนหา Key ที่ใช้งานได้มารับหน้าที่ต่อทันที โดยที่ผู้ใช้จะไม่รู้ตัว"),
                createHeader("5.2 Groq Fallback (แผนสำรองฉุกเฉิน)", HeadingLevel.HEADING_2),
                createText("ในกรณีเลวร้ายที่สุดที่ Google Gemini API ล่มทั้งหมด (Circuit Breaker เปิดทุกตัว) ระบบจะจับ Error แล้ว Fallback สลับการยิง API ไปที่ Groq (llama-3.3-70b-versatile) ทันที ซึ่งรับประกันการตอบสนองที่ 100% Uptime"),
                
                createHeader("5.3 JSON Forced Output", HeadingLevel.HEADING_2),
                createText("AI ถูก System Prompt บังคับให้ตอบกลับมาเป็นฟอร์แมต JSON ล้วนๆ ห้ามมี Markdown หรือ Text ปน เพื่อให้ Frontend นำไป Parsing และ Execute ได้ทันที ประกอบด้วย:"),
                createText('{ "reply": "...", "cssCommand": "...", "action": null, "interactive": null }', true),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 6 ---
                createHeader("บทที่ 6: ระบบ Web Crawler รวบรวมความรู้ (api/crawl.js)", HeadingLevel.HEADING_1),
                createText("ระบบนี้ทำหน้าที่อ่านหน้าเว็บอื่นๆ (Internal Links) ในเว็บไซต์ลูกค้า เพื่อหาข้อมูลที่ไม่ได้อยู่ในหน้านี้"),
                createHeader("6.1 การทำงานของ Crawler", HeadingLevel.HEADING_2),
                createBullet("- ดึง URL ทั้งหมดในหน้าด้วย Regex /<a[^>]+href.../"),
                createBullet("- กรองหน้าเว็บที่ไม่ควรเข้า (admin, login, checkout) ออก"),
                createBullet("- โหลด HTML กรอง Script และ Style ทิ้งด้วย Regex"),
                createBullet("- ใช้ระบบ Scoring นำคำใน Text มาเปรียบเทียบกับ Keywords ที่ AI ร้องขอ"),
                createBullet("- คืนค่า Snippet สั้นๆ ประมาณ 260 ตัวอักษร ให้ AI ใช้ตอบคำถาม"),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 7 ---
                createHeader("บทที่ 7: ฐานข้อมูลและความปลอดภัย (Supabase & PostgreSQL)", HeadingLevel.HEADING_1),
                createText("ระบบจัดเก็บข้อมูลบน Supabase (PostgreSQL) มีโครงสร้างดังนี้ (จากไฟล์ supabase_setup.sql):"),
                createHeader("7.1 โครงสร้างตาราง (Tables)", HeadingLevel.HEADING_2),
                createBullet("1. tenants: เก็บข้อมูลลูกค้า (company_name), API Key (gen_random_bytes), และวันหมดอายุ (expires_at)"),
                createBullet("2. knowledge_chunks: เก็บ URL, Title และ Content เพื่อใช้ทำ RAG"),
                createBullet("3. settings: เก็บ Configuration รวมของระบบ เช่น Theme, Model, Payment Mode"),
                createBullet("4. logs: เก็บข้อมูล Analytics, Error Logs, ทราฟฟิกแยกตาม Tenant (มีประโยชน์ตอนทำ Dashboard)"),
                createBullet("5. billing_requests & payment_methods: ระบบจัดการการจ่ายเงิน เช่าใช้แพ็กเกจ (SaaS Model)"),
                createHeader("7.2 Row-Level Security (RLS)", HeadingLevel.HEADING_2),
                createText("เปิด RLS ป้องกันการเข้าถึงข้อมูลข้าม Tenant และอนุญาตเฉพาะ Service Role (Backend API) ในการอ่าน/เขียนข้อมูล เพื่อความปลอดภัยสูงสุดระดับ Enterprise"),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 8 ---
                createHeader("บทที่ 8: การตรวจเช็คสุขภาพระบบ (Health & Metrics)", HeadingLevel.HEADING_1),
                createText("ไฟล์ api/v1/health.js ทำหน้าที่เป็น Heartbeat ให้ระบบ Infrastructure (เช่น Kubernetes หรือ PM2) คอยยิงมาเพื่อเช็คว่าระบบยังทำงานปกติหรือไม่"),
                createBullet("- /api/v1/health: ส่งค่า { status: 'healthy', checks: { gemini_key: 'ok', supabase: 'ok' } }"),
                createBullet("- /api/v1/metrics: รายงานสถิติ RAM (Memory Usage: rss_mb, heap_used), Uptime, Cache Hit Rate (%), และจำนวนครั้งที่ Agent ทำงาน (Planner/Executor)"),
                new Paragraph({ children: [new PageBreak()] }),

                // --- Chapter 9 ---
                createHeader("บทที่ 9: การติดตั้งและการปรับใช้ (Deployment)", HeadingLevel.HEADING_1),
                createText("โปรเจคนี้รองรับการ Deploy ทั้ง 3 รูปแบบมาตรฐานอุตสาหกรรม:"),
                createBullet("1. Vercel (Serverless): ตั้งค่าผ่าน vercel.json ทำงานแบบ Function-as-a-Service ไม่ต้องเช่าเซิร์ฟเวอร์เต็มรูปแบบ (Cost-effective)"),
                createBullet("2. PM2 (Node.js VPS): มีสคริปต์ npm run prod และ start-pm2.bat รัน Daemon process ในแบคกราวด์ พร้อมระบบ Watch ไฟล์"),
                createBullet("3. Docker / Kubernetes: มี Dockerfile และ docker-compose.yml พร้อมสำหรับนำไปรันบน Kubernetes (โฟลเดอร์ k8s/) เพื่อทำ Auto-scaling เมื่อมีทราฟฟิกสูง"),
                
                // --- Conclusion ---
                createHeader("บทสรุป", HeadingLevel.HEADING_1),
                createText("INDICATOR WEB CHAT ถูกสถาปัตยกรรมขึ้นมาเพื่อเป็น Enterprise AI Widget ที่ครบวงจรที่สุด มีทั้งระบบป้องกัน (Security & Safety), ระบบฉุกเฉิน (Circuit Breaker & Fallback), ระบบเรียนรู้พฤติกรรม (Autonomous Observer), และพร้อมต่อยอดเป็น SaaS Platform ด้วยโครงสร้าง Database แบบ Multi-tenant เต็มรูปแบบ")
            ]
        }
    ]
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("INDICATOR_Architecture_Book.docx", buffer);
    console.log("SUCCESS");
});
