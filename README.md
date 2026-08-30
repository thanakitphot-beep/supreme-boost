# INDICATOR WEB CHAT

โปรเจคนี้เป็น multi-tenant website assistant ที่ใช้สคริปต์ฝังหน้าเว็บและ Node.js API ของ INDICATOR เอง โหมดมาตรฐานใช้ deterministic owned agent เป็นตัวตัดสินข้อมูลและ action ส่วนคำถามทั่วไปใช้ model provider ที่กำหนดไว้

## โครงสร้าง

- `index.html` - หน้าเว็บผลิตภัณฑ์และ Free Preview
- `supreme-boost/boost.js` - สคริปต์ embed widget แชท AI, อ่านข้อมูลบนหน้าเว็บ, รองรับหลายภาษา
- `api/chat.js` - API endpoint ที่เรียก INDICATOR Agent และคืนค่า reply + action สำหรับ widget
- `services/indicatorAgent.js` - Agent ของ INDICATOR สำหรับค้นสินค้า, นำทาง, คำศัพท์, สรุป และ handoff
- `data/indicator-knowledge.json` - knowledge registry สำหรับหน้าเว็บ สินค้า และคำศัพท์
- `render.yaml` - กำหนด Render Free preview, startup gate และ readiness probe
- `evals/` - ชุด benchmark, baseline, schema และผล regression

## ฟีเจอร์เด่น

- รองรับหลายภาษา (ไทย, อังกฤษ, จีน, ญี่ปุ่น)
- อ่านเนื้อหาหน้าเว็บเพื่อให้ AI ตอบคำถามตามบริบท
- ปรับขนาดตัวอักษรและธีมหน้าจอโดยคำสั่งแชท
- ฟอลล์แบ็กแบบ deterministic กรณี model provider ใช้งานไม่ได้
- รองรับ Render, Docker และ Kubernetes

## การใช้งาน

### สำหรับ Production

1. นำชื่อตัวแปรจาก `.env.example` ไปกำหนดใน secret manager ของ platform โดยไม่ commit ค่า secrets
2. ใช้ MongoDB replica set แล้วรัน `npm run db:indexes` และ `npm run preflight:dependencies`
3. ตั้ง exact `CORS_ALLOWED_ORIGINS` และ `allowed_origins` ของ tenant
4. ก่อนเปิด traffic รัน `npm run preflight:live`
5. ฝังสคริปต์ด้วย API key ของ tenant:

```html
<script src="https://indicator-web-chat.onrender.com/supreme-boost/boost.js"
        data-api-key="TENANT_API_KEY"
        data-backend-url="https://indicator-web-chat.onrender.com/api/chat"
        defer>
</script>
```

กำหนด exact origin ของเว็บไซต์ลูกค้าใน `allowed_origins` ก่อนใช้งาน key นี้

### สำหรับ Development (ทดสอบในเครื่อง)

1. รันในเครื่อง:

```bash
npm install
npm run dev
```

2. เปิด `http://localhost:3000`

ค่าเริ่มต้นคือ `INDICATOR_AGENT_MODE=owned` ซึ่งให้ deterministic agent ตอบข้อมูลที่ยืนยันได้ก่อน และเรียก provider เฉพาะคำถามทั่วไป หากต้อง rollback ชั่วคราว ให้ตั้ง `INDICATOR_AGENT_MODE=legacy` ก่อนเริ่ม server

## ตัวอย่างการตั้งค่า Widget

```html
<script src="https://indicator-web-chat.onrender.com/supreme-boost/boost.js"
        data-api-key="TENANT_API_KEY"
        data-lang="auto"
        data-title="Customer AI Support"
        data-shop-prompt="ร้านนี้ชื่อ INDICATOR Shop ขายเสื้อผ้าวัยรุ่น มีโปรโมชันส่งฟรีเมื่อซื้อครบ 1000 บาท"
        data-primary="#2563eb"
        data-position="right"
        defer>
</script>
```

## ปรับแต่งเพิ่มเติม

| Attribute | ค่า | คำอธิบาย |
|-----------|-----|----------|
| `data-lang` | `auto`, `th`, `en`, `zh`, `ja` | ภาษา (auto = ตรวจจากเบราว์เซอร์) |
| `data-title` | ข้อความ | ชื่อ widget |
| `data-shop-prompt` | ข้อความ | บริบทข้อมูลร้าน |
| `data-primary` | สี hex/rgb | สีหลักของ widget |
| `data-position` | `left`, `right` | ตำแหน่ง widget |
| `data-open` | `true`, `false` | เปิด widget ตั้งต้น |
| `data-greeting` | ข้อความ | ข้อความทักทายแรก |

## ความสามารถ

- Widget จะอ่าน origin ของสคริปต์เองและส่ง request ไปยัง `/api/chat` บน deployment เดียวกัน
- Production อนุญาตเฉพาะ exact HTTPS origins ที่ลงทะเบียนไว้กับ tenant
- ถ้า AI ตอบไม่ได้ ระบบจะพยายามใช้ข้อมูลบนหน้าเว็บเป็น fallback

## Free Preview

- `REGISTRATION_MODE=disabled`: บัญชีใหม่เปิดแบบ invitation-only
- `HANDOFF_DELIVERY_MODE=contact_only`: เก็บคำขอใน admin queue โดยไม่รับประกันอีเมล
- `PAYMENT_MODE=manual`: การชำระเงินต้องผ่าน admin approval
- Render Free อาจ sleep/cold-start, มี instance เดียว และไม่มี SLA

ดู release gates ที่ `docs/PRODUCTION_READINESS.md`, วิธีสำรองข้อมูลที่
`docs/BACKUP_RESTORE.md` และขั้นตอน rollback ที่ `docs/ROLLBACK.md`
