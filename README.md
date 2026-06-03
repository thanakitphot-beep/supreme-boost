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

3. เปิด `index.html` ในเบราว์เซอร์ หรือเข้าผ่าน `vercel dev` หากต้องการใช้ backend API ของโปรเจค

## ตัวอย่างการฝังสคริปต์

```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
        data-lang="auto"
        data-shop-prompt="ร้านนี้ชื่อ Supreme Shop ขายเสื้อผ้าวัยรุ่น มีโปรโมชันส่งฟรีเมื่อซื้อครบ 1000 บาท"
        defer>
</script>
```

## ปรับแต่งเพิ่มเติม

- `data-title` - กำหนดชื่อ widget
- `data-primary` - กำหนดสีหลักของ widget
- `data-position` - `left` หรือ `right`
- `data-open` - `true` หากต้องการเปิด widget ตั้งต้น
- `data-backend-url` - กำหนด backend API แบบกำหนดเอง

## การ deploy บน Vercel

1. สร้างโปรเจคบน Vercel และเชื่อมต่อ GitHub หรือโฟลเดอร์นี้
2. ตั้งค่า environment variable `GEMINI_API_KEY` บน Vercel
3. ตั้งค่า `vercel.json` ให้ส่งเมต้า header ให้กับคำขอสคริปต์

## หมายเหตุ

- โปรเจคนี้ไม่ต้องการ dependencies ภายนอก นอกจาก Node.js สำหรับรัน serverless API
- ถ้าใช้งานในเบราว์เซอร์จริง ให้แน่ใจว่า `boost.js` ถูกโหลดผ่าน HTTP/HTTPS เพื่อให้ backend URL ทำงานได้อย่างถูกต้อง
