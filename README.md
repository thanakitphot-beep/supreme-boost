# Supreme Boost

โปรเจคนี้เป็นตัวอย่าง widget แชท AI สำหรับเว็บไซต์ โดยใช้สคริปต์ฝังหน้าเว็บเดียวและ backend serverless API เพื่อเชื่อมต่อกับ Gemini API.

## โครงสร้าง

- `index.html` - หน้าเดโมเว็บตัวอย่าง
- `supreme-boost/boost.js` - สคริปต์ embed widget แชท AI, อ่านข้อมูลบนหน้าเว็บ, รองรับหลายภาษา
- `api/chat.js` - API endpoint สำหรับส่ง prompt ไปยัง Gemini และคืนค่า reply + CSS command
- `plugins/chat.js` - widget แชท AI แบบปลั๊กอินแยกต่างหาก
- `plugins/darkmode.js` - ปุ่มสลับโหมดมืดสำหรับหน้าเว็บ
- `plugins/manager.js` - ตัวจัดการโหลดปลั๊กอิน
- `vercel.json` - กำหนด header สำหรับไฟล์สคริปต์และปลั๊กอิน

## ฟีเจอร์เด่น

- รองรับหลายภาษา (ไทย, อังกฤษ, จีน, ญี่ปุ่น)
- อ่านเนื้อหาหน้าเว็บเพื่อให้ AI ตอบคำถามตามบริบท
- ปรับขนาดตัวอักษรและธีมหน้าจอโดยคำสั่งแชท
- ฟอลล์แบ็กกรณี AI หลักใช้งานไม่ได้
- รองรับการโฮสต์บน Vercel

## การใช้งาน

### สำหรับ Production (Deploy บน Vercel)

1. สร้างโปรเจคบน Vercel และเชื่อมต่อ GitHub หรือโฟลเดอร์นี้
2. ตั้งค่า environment variable `GEMINI_API_KEY` บน Vercel dashboard
3. ฝังสคริปต์นี้ลงไปบนเว็บไซต์ใดก็ได้:

```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
        data-shop-prompt="ร้านนี้ชื่อ Supreme Shop มีโปรส่งฟรีเมื่อซื้อครบ 1000 บาท"
        defer>
</script>
```

**แทน `YOUR-VERCEL-DOMAIN` ด้วย domain ของคุณบน Vercel**

### สำหรับ Development (ทดสอบในเครื่อง)

1. ตั้งค่า environment variable:

```bash
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

2. รันในเครื่อง:

```bash
npm install
npm run dev
```

3. เปิด `http://localhost:3000` (หรือตามที่ vercel dev กำหนด)

## ตัวอย่างการตั้งค่า Widget

```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
        data-lang="auto"
        data-title="Customer AI Support"
        data-shop-prompt="ร้านนี้ชื่อ Supreme Shop ขายเสื้อผ้าวัยรุ่น มีโปรโมชันส่งฟรีเมื่อซื้อครบ 1000 บาท"
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
- ระบบรองรับ CORS ทั้งหมด สามารถโหลดบนเว็บไซต์ใดก็ได้
- ถ้า AI ตอบไม่ได้ ระบบจะพยายามใช้ข้อมูลบนหน้าเว็บเป็น fallback
