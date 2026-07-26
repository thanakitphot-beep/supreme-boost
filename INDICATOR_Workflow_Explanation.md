# คู่มืออธิบายการทำงานของระบบ INDICATOR WEB CHAT (supreme-boost)

เอกสารฉบับนี้อธิบายกระบวนการทำงานแบบเจาะลึกของโปรเจค INDICATOR WEB CHAT ตั้งแต่ฝั่งผู้ใช้งาน (Frontend Widget) ไปจนถึงการประมวลผลของ AI และฐานข้อมูล (Backend)

## 1. โครงสร้างและการทำงานฝั่ง Widget (Frontend: src/widget/main.js)

**การเริ่มต้น (Initialization):** เมื่อหน้าเว็บทำการโหลดสคริปต์ `boost.js` (ถูกคอมไพล์ด้วย esbuild ผ่าน `build.js`) ระบบจะสร้าง Shadow DOM ขึ้นมาเพื่อไม่ให้ CSS ของ Widget ไปตีกับเว็บไซต์หลัก พร้อมกับเตรียมระบบเสียง (SpeechRecognition) สำหรับรับคำสั่งเสียง และ Text-to-Speech

**การดึงข้อมูล Site DNA:** ฟังก์ชัน `extractSiteDNA()` จะทำการสแกนหน้าเว็บเพื่อดึง Meta Tags, หัวข้อ (h1, h2, h3), ข้อมูลสินค้า (price/title), โครงสร้างตาราง รวมถึงข้อความที่อยู่ตรงจุดกึ่งกลางหน้าจอ (Active Section) เพื่อให้ AI รู้ว่าลูกค้ากำลังดูอะไรอยู่

**Behavioral Observer (Autonomous Brain):** ระบบจะคอยจับตาดูพฤติกรรมผู้ใช้แบบ Real-time:
- **Hesitation (ความลังเล):** ถ้าเมาส์ค้างที่องค์ประกอบใดนานกว่า 4 วินาที ระบบจะส่ง Context เข้า AI
- **Rage Click (คลิกรัวๆ):** ถ้าคลิกรัว 3 ครั้งในบริเวณเดิม ถือว่าลูกค้ากำลังหงุดหงิด (Frustration) และจะเรียก Human Handoff (ติดต่อเจ้าหน้าที่)
- **Confusion (การเลื่อนหน้าจอขึ้นลงไปมา):** ถ้าเลื่อนจอเปลี่ยนทิศทางบ่อยเกินไป ระบบจะถือว่าลูกค้าสับสน

## 2. การเชื่อมต่อและระบบความปลอดภัย (Security & API Layer: api/chat.js)

**Tenant Validation:** เมื่อ Widget ส่งข้อความมาที่ `/api/chat` ระบบจะตรวจสอบ API Key กับฐานข้อมูล Supabase (ตาราง `tenants`) ก่อนว่าบัญชีถูกระงับ (Suspended) หรือหมดอายุหรือไม่ หากผิดปกติจะ Block การทำงานทันที

**Data Sanitization & Masking:** ฟังก์ชัน `maskPII()` และ `sanitizeDNA()` จะลบข้อมูลละเอียดอ่อน เช่น เลขบัตรประชาชน, บัตรเครดิต, เบอร์โทรศัพท์, หรืออีเมล ก่อนที่จะส่งข้อมูลออกไปยัง AI เพื่อรักษาความปลอดภัยของผู้ใช้งาน (Zero Trust)

**RAG Context (Knowledge Base):** ระบบจะนำ Prompt ของผู้ใช้ไปค้นหาในฐานข้อมูล Supabase ผ่าน `getRagContext()` เพื่อดึงข้อมูลความรู้ (Knowledge Chunks) ของร้านนั้นๆ มาแนบให้ AI ตอบได้ตรงคำถามมากขึ้น

## 3. ระบบสมองกล Multi-Agent (LLM Orchestrator: services/llm.js)

**Agent Planner:** ทำงานเสมือนสมองส่วนหน้า เพื่อแยกว่าคำสั่งนี้ควรคุยปกติ (Chat) หรือต้องเรียกใช้ Plugin ภายนอก

**Circuit Breaker & Fallback System:** ใช้ Gemini API เป็นหลัก (`gemini-2.5-flash`) โดยมีระบบสลับ API Key ถึง 5 ตัว หากตัวไหนพังหรือติด Limit จะข้ามไปใช้อีกตัวอัตโนมัติ หาก Gemini พังทั้งหมด ระบบจะสลับไปใช้ Groq (`llama-3.3-70b-versatile`) แทน เพื่อให้ระบบไม่ล่ม (100% Uptime Guarantee)

**JSON Output & CSS Command:** AI จะถูกบังคับให้ตอบกลับมาเป็น JSON เท่านั้น ซึ่งประกอบด้วย ข้อความตอบกลับ (`reply`), คำสั่งปรับแต่งเว็บ (`cssCommand`), และ UI แบบโต้ตอบ (`interactive`)

## 4. ระบบรวบรวมข้อมูลหน้าเว็บอัตโนมัติ (Web Crawler: api/crawl.js)

**การทำงานของ Crawler:** ใช้หาข้อมูลที่กระจายอยู่บนหน้าเว็บอื่นๆ (เช่น จาก URL ที่ต่างออกไป) โดยจะดึง HTML, กรอง Script/Style ทิ้ง แล้วนำ Text มาให้คะแนน (Score) เปรียบเทียบกับคำค้นหา (Keywords) ที่ AI ต้องการ แล้วดึง Snippet ที่ตรงที่สุดกลับไป

## 5. ฐานข้อมูลและสถาปัตยกรรม (Database: supabase_setup.sql)

ระบบฐานข้อมูลใช้ PostgreSQL (บน Supabase) ประกอบด้วยตารางหลักๆ ดังนี้:
- `tenants`: จัดการบริษัทที่สมัครใช้งาน ระบบแพ็กเกจ และ API Key
- `settings`: เก็บการตั้งค่าส่วนกลางและ Theme
- `knowledge_chunks`: เก็บข้อมูล Vector / เนื้อหาความรู้ของแต่ละร้านค้า (RAG)
- `logs`: เก็บประวัติการทำงานและข้อผิดพลาดเพื่อใช้ทำ Analytics

---
**สรุป:** ระบบนี้ไม่ใช่แค่ Chatbot ทั่วไป แต่เป็นระบบ AI ฝังตัวที่มีความสามารถรับรู้พฤติกรรม (Observer), ปรับแก้ปัญหาการเชื่อมต่อเอง (Circuit Breaker) และควบคุม UI หน้าเว็บลูกค้าได้อย่างอิสระ
