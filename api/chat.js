// api/chat.js — Vercel Serverless Function สำหรับ Supreme AI Chat
// ซ่อน API Key ไว้บนเซิร์ฟเวอร์ ไม่ให้คนดูหน้าเว็บเห็น

module.exports = async function handler(req, res) {
    // ✅ รองรับ CORS ให้เว็บไหนก็เรียกใช้ได้
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // รองรับ preflight request (OPTIONS)
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    // อนุญาตเฉพาะ POST เท่านั้น
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { prompt, pageContent, shopPrompt } = req.body;

        // ตรวจสอบว่ามีข้อความส่งมาไหม
        if (!prompt || prompt.trim() === "") {
            return res.status(400).json({ error: "กรุณาพิมพ์ข้อความก่อนส่ง" });
        }

        // ดึง API Key จาก Environment Variable บน Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("❌ GEMINI_API_KEY ไม่ได้ตั้งค่าบน Vercel Environment Variables");
            return res.status(500).json({ error: "ระบบยังไม่ได้ตั้งค่า API Key กรุณาแจ้งผู้ดูแลระบบ" });
        }

        // สร้าง System Prompt ที่รวมข้อมูลหน้าเว็บ + คำสั่งร้านค้า
        const systemInstruction = buildSystemPrompt(pageContent, shopPrompt);

        // เรียก Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const geminiResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                },
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024,
                    topP: 0.9,
                    responseMimeType: "application/json",
                }
            })
        });

        // ตรวจสอบ HTTP status จาก Gemini
        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            console.error("❌ Gemini API Error:", geminiResponse.status, errorBody);

            if (geminiResponse.status === 400) {
                return res.status(500).json({ error: "คำถามนี้ไม่สามารถตอบได้ กรุณาลองถามใหม่" });
            }
            if (geminiResponse.status === 429) {
                return res.status(500).json({ error: "ขณะนี้มีคนใช้งานเยอะ กรุณารอสักครู่แล้วลองใหม่" });
            }
            return res.status(500).json({ error: "เกิดข้อผิดพลาดจาก AI กรุณาลองใหม่อีกครั้ง" });
        }

        const data = await geminiResponse.json();

        // ดึงคำตอบจาก response
        const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (replyText) {
            try {
                // พยายามแปลงข้อความที่ได้ให้เป็น JSON object
                const parsedReply = JSON.parse(replyText);
                return res.status(200).json(parsedReply);
            } catch (e) {
                // กรณี AI ส่งมาไม่ใช่ JSON ที่สมบูรณ์ ให้คืนค่าเป็น text ธรรมดา
                return res.status(200).json({ reply: replyText });
            }
        } else {
            console.error("❌ Gemini response ไม่มี text:", JSON.stringify(data));
            return res.status(500).json({ error: "AI ไม่สามารถสร้างคำตอบได้ กรุณาลองถามใหม่" });
        }

    } catch (error) {
        console.error("❌ Server Error:", error);
        return res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" });
    }
}

/**
 * สร้าง System Prompt ที่รวมข้อมูลหน้าเว็บและคำสั่งร้านค้า
 */
function buildSystemPrompt(pageContent, shopPrompt) {
    let systemPrompt = `คุณคือผู้ช่วย AI ประจำเว็บไซต์นี้ ชื่อ "Supreme AI"
หน้าที่ของคุณคือตอบคำถามเกี่ยวกับร้านค้า สินค้า และบริการของเว็บไซต์นี้เท่านั้น
คุณต้องตอบคำถามเป็นภาษาไทยเสมอ ยกเว้นผู้ใช้ถามเป็นภาษาอื่น
ตอบให้กระชับ ตรงประเด็น เข้าใจง่าย ใช้น้ำเสียงเป็นมิตร

กฎเหล็กที่ต้องปฏิบัติตามอย่างเคร่งครัด:
1. ห้ามตอบคำถามหรือพูดคุยในหัวข้อที่ไม่เกี่ยวข้องกับร้านค้า สินค้า หรือเนื้อหาบนหน้าเว็บนี้เด็ดขาด
2. หากผู้ใช้ถามเรื่องทั่วไป (เช่น สภาพอากาศ, การเมือง, เขียนโค้ด, เล่นมุกตลก) ให้ปฏิเสธอย่างสุภาพ เช่น "ขออภัยครับ ผมเป็นผู้ช่วยดูแลร้านค้า สามารถให้ข้อมูลเกี่ยวกับร้านและสินค้าของเราได้เท่านั้นครับ"
3. ห้ามแต่งข้อมูลสินค้าหรือราคาที่ไม่มีอยู่จริง ถ้าไม่แน่ใจให้บอกว่า "ขออภัยครับ ข้อมูลนี้ไม่ได้ระบุไว้บนหน้าเว็บ"
4. คุณมีพลังในการควบคุมหน้าเว็บด้วยคำสั่ง CSS! หากผู้ใช้มีความต้องการพิเศษ (เช่น อยากให้ตัวหนังสือใหญ่ขึ้น, เปลี่ยนเว็บเป็นสีชมพู, ใช้ธีมสีเข้ม) คุณสามารถสร้างคำสั่ง CSS เพื่อตอบสนองความต้องการนั้นได้

รูปแบบการตอบกลับ (ต้องเป็น JSON เท่านั้น):
{
  "reply": "ข้อความที่ต้องการตอบผู้ใช้ (ปฏิบัติตามกฎ 3 ข้อแรกอย่างเคร่งครัด)",
  "cssCommand": "คำสั่ง CSS เพียวๆ ที่ใช้ปรับหน้าเว็บตามที่ผู้ใช้ขอ (เช่น 'body { background-color: pink !important; }') ถ้าผู้ใช้ไม่ได้ขอปรับแต่งหน้าเว็บ ให้ใส่ค่าเป็น string ว่าง ('')"
}`;

    // เพิ่มคำสั่งเฉพาะของร้านค้า (ถ้ามี)
    if (shopPrompt && shopPrompt.trim() !== "") {
        systemPrompt += `\n\nคำสั่งเพิ่มเติมจากเจ้าของร้าน:\n${shopPrompt}`;
    }

    // เพิ่มเนื้อหาจากหน้าเว็บ (ถ้ามี)
    if (pageContent && pageContent.trim() !== "") {
        // จำกัดขนาดเนื้อหาไม่เกิน 4000 ตัวอักษร เพื่อไม่ให้เกิน token limit
        const trimmedContent = pageContent.trim().substring(0, 4000);
        systemPrompt += `\n\nข้อมูลบนหน้าเว็บปัจจุบันที่ผู้ใช้กำลังดูอยู่:\n---\n${trimmedContent}\n---`;
    }

    return systemPrompt;
}
