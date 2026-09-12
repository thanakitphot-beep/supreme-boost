# INDICATOR MCP และการพัฒนา AI

เพิ่ม MCP สำหรับงานพัฒนา INDICATOR ใน `.vscode/mcp.json` ใช้ official MCP TypeScript SDK ผ่าน stdio แยก dependencies ไว้ใน `tools/indicator-mcp` และไม่อ่าน `.env`

## ใช้ใน VS Code

1. เปิดโฟลเดอร์โปรเจกต์นี้ใน VS Code
2. ใช้ AI chat ที่รองรับ MCP และลงชื่อเข้าใช้บัญชีของคุณ
3. กด Ctrl+Shift+P → `MCP: List Servers` → `indicator-local` → Start
4. เลือกเครื่องมือของ server ในแชต แล้วสั่งให้ลอง `indicator_preview` ด้วย prompt ภาษาไทย หรือ `indicator_context` พร้อม entities ตัวอย่าง

สำหรับเครื่องใหม่: `npm ci --prefix tools/indicator-mcp --ignore-scripts` แล้ว `npm test --prefix tools/indicator-mcp`

## เครื่องมือ

- `indicator_preview`: ทดสอบ resolver ในเครื่อง คืนคำตอบและข้อเสนอ action แต่ไม่คลิกเว็บหรือเชื่อมเจ้าหน้าที่จริง
- `indicator_context`: ตรวจข้อความที่เตรียมให้โมเดลจากข้อมูลตัวอย่าง ไม่เรียก API โมเดล
- `indicator_training_audit`: ตรวจชุดฝึกจำลอง จำนวนแต่ละ split และ hash โดยไม่เขียนหรืออัปโหลดข้อมูล

นี่คือ MCP ของ INDICATOR ไม่ใช่การแปลงปลั๊กอิน Computer Use ของ ChatGPT ให้ควบคุม Windows จาก VS Code ปลั๊กอินที่ติดตั้งไม่พบ standalone server configuration และ runtime `node_repl` ที่ปลั๊กอินต้องการไม่พร้อมใช้ในเซสชันนี้

## การปรับ AI รอบนี้

แยกงบข้อมูลสินค้าที่มองเห็นออกจาก page/RAG เพื่อไม่ให้ข้อความยาวเบียดราคาและสต็อกหาย เลือกสินค้าที่ถูกกล่าวถึงก่อน ส่งเฉพาะฟิลด์ที่อนุญาต จำกัดขนาด และไม่เปลี่ยนข้อมูลต้นฉบับ มี regression tests สำหรับข้อมูลยาว ราคา 0 สต็อก false และสินค้านอก 20 รายการแรก

## การฝึกและการวัดผล

โครงการมีชุดข้อมูลฝึกจำลองและตัวเตรียม JSONL อยู่แล้ว:

```powershell
node evals/prepare-agent-training.js
node evals/prepare-agent-training.js --validate=evals/generated
npm test
npm test --prefix tools/indicator-mcp
```

เมื่อตั้งค่า provider และพร้อมใช้โควตา ให้ทดสอบเส้นทางจริง:

```powershell
npm run eval:thai:live -- --pipeline --split=holdout --label=candidate
```

การเตรียม JSONL และการปรับ context ไม่ใช่การฝึก weights โมเดล ยังไม่มีหลักฐานว่าเทียบเท่า agent เชิงพาณิชย์ ต้องเลือกคู่เทียบ ใช้โจทย์เดียวกัน วัดความถูกต้อง งานที่ทำสำเร็จ การไม่แต่งข้อเท็จจริง latency และต้นทุน พร้อมตรวจคำตอบโดยคนก่อนอ้างผลเปรียบเทียบ

เอกสารอ้างอิง: [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers), [MCP SDK](https://ts.sdk.modelcontextprotocol.io/server), [การประเมินโมเดล](https://developers.openai.com/api/docs/guides/evals)
