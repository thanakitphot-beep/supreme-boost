# INDICATOR Intelligence Service

บริการ Python แบบแยกจาก Node/widget เดิมสำหรับตอบคำถามจากหลักฐานจริงเท่านั้น

## หลักการ

- ข้อมูลสินค้า ราคา และสต็อก: ใช้ catalog/API ที่เชื่อถือได้
- เอกสาร นโยบาย และบทความ: ใช้ RAG พร้อม citation
- ไม่มีหลักฐาน: ตอบ `insufficient_evidence` ไม่เดาข้อมูล
- คำแนะนำสินค้า: แสดงตัวเลือก แต่ไม่สร้าง action วาร์ปเอง
- ข้อความแชตไม่ถูกนำไปเป็น knowledge โดยอัตโนมัติ

## Local development

```powershell
cd C:\Users\WAyu\Desktop\test\indicator-ai
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8100
```

เปิด Swagger ได้ที่ `http://127.0.0.1:8100/docs` และ health check ที่ `/health`.

## Docker

```powershell
docker compose up --build
```

Docker stack เตรียม FastAPI, Qdrant, PostgreSQL และ Redis ไว้แล้ว โดยค่าเริ่มต้น
`INDICATOR_RAG_BACKEND=memory` เพื่อให้เทสต์ได้โดยไม่ต้องมี embedding model.
เปลี่ยนเป็น `qdrant` หลังตั้ง ingestion worker และ embedding provider ที่อนุมัติแล้ว.

## การเชื่อมกับ Node/widget

Node API รองรับ feature flag แล้ว และจะ fallback กลับสู่ Agent เดิมอัตโนมัติหาก
Python service timeout หรือคืนผลลัพธ์ไม่ถูกต้อง:

```powershell
$env:INDICATOR_INTELLIGENCE_URL = "http://127.0.0.1:8100"
$env:INDICATOR_INTELLIGENCE_MODE = "on"
npm start
```

Widget สร้าง `conversationId` แบบสุ่มและเก็บไว้ใน localStorage ของเว็บไซต์ เพื่อให้
memory แยกตามผู้ใช้ในเบราว์เซอร์เดียวกัน โดยไม่แชร์ประวัติให้ผู้เยี่ยมชมคนอื่น.

## ความจำบทสนทนา

ใน local development บริการจะเก็บ summary และ 8 ข้อความล่าสุดแยกตาม
`site_id + conversation_id` ไว้ที่ `data/conversations.json` จึงคุยต่อได้หลัง
รีเฟรชหน้าหรือรีสตาร์ต service. ข้อมูลนี้ไม่ถูกนำไปเป็น knowledge หรือใช้ตอบแทน
ข้อมูลสินค้า/นโยบาย และล้างอัตโนมัติตาม `INDICATOR_CONVERSATION_TTL_HOURS`
(ค่าเริ่มต้น 30 วัน). Production ควรแทนที่ด้วย Postgres และใช้ session/consent ของลูกค้า.

ลบความจำของแชตหนึ่งชุดได้ด้วย `DELETE /v1/conversations/{site_id}/{conversation_id}`.
