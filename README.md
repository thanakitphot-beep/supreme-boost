# INDICATOR WEB CHAT

โปรเจคนี้เป็น widget AI Agent สำหรับเว็บไซต์ โดยใช้สคริปต์ฝังหน้าเว็บเดียวและ backend serverless API ของ INDICATOR เอง ไม่เรียก Gemini ในโหมดมาตรฐาน.

## โครงสร้าง

- `index.html` - หน้าเดโมเว็บตัวอย่าง
- `supreme-boost/boost.js` - สคริปต์ embed widget แชท AI, อ่านข้อมูลบนหน้าเว็บ, รองรับหลายภาษา
- `api/chat.js` - API endpoint ที่เรียก INDICATOR Agent และคืนค่า reply + action สำหรับ widget
- `services/indicatorAgent.js` - Agent ของ INDICATOR สำหรับค้นสินค้า, นำทาง, คำศัพท์, สรุป และ handoff
- `data/indicator-knowledge.json` - knowledge registry สำหรับหน้าเว็บ สินค้า และคำศัพท์
- `vercel.json` - กำหนด header สำหรับไฟล์สคริปต์และปลั๊กอิน

## ฟีเจอร์เด่น

- รองรับหลายภาษา (ไทย, อังกฤษ, จีน, ญี่ปุ่น)
- อ่านเนื้อหาหน้าเว็บเพื่อให้ AI ตอบคำถามตามบริบท
- ปรับขนาดตัวอักษรและธีมหน้าจอโดยคำสั่งแชท
- ฟอลล์แบ็กกรณี AI หลักใช้งานไม่ได้
- รองรับ Render, Docker, Vercel และ Kubernetes

## การใช้งาน

### สำหรับ Production

1. คัดลอก `.env.example` ไปกำหนดใน secret manager ของ platform โดยไม่ commit secrets
2. ใช้ MongoDB replica set แล้วรัน `npm run db:indexes` และ `npm run preflight:dependencies`
3. ตั้ง exact `CORS_ALLOWED_ORIGINS` และ `allowed_origins` ของ tenant
4. ก่อนเปิด traffic รัน `npm run preflight:live`
5. ฝังสคริปต์ด้วย API key ของ tenant:

```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
        data-api-key="TENANT_API_KEY"
        data-backend-url="https://YOUR-API-DOMAIN/api/chat"
        defer>
</script>
```

**แทน `YOUR-VERCEL-DOMAIN` ด้วย domain ของคุณบน Vercel**

### สำหรับ Development (ทดสอบในเครื่อง)

1. รันในเครื่อง:

```bash
npm install
npm run dev
```

2. เปิด `http://localhost:3000` (หรือตามที่ vercel dev กำหนด)

ค่าเริ่มต้นคือ `INDICATOR_AGENT_MODE=owned` ซึ่งจะไม่เรียก Gemini หรือผู้ให้บริการโมเดลภายนอก หากต้อง rollback ชั่วคราว ให้ตั้ง `INDICATOR_AGENT_MODE=legacy` ก่อนเริ่ม server.

## ตัวอย่างการตั้งค่า Widget

```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
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

- Widget ที่ load จาก Vercel จะอ่าน origin ของสคริปต์เองและส่ง request ไปยัง `/api/chat` บน domain เดียวกัน
- Production อนุญาตเฉพาะ exact HTTPS origins ที่ลงทะเบียนไว้กับ tenant
- ถ้า AI ตอบไม่ได้ ระบบจะพยายามใช้ข้อมูลบนหน้าเว็บเป็น fallback
