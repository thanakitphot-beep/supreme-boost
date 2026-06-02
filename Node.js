// ตัวอย่างโค้ดฝั่ง Server (ตัวกลาง)
export default async function handler(req, res) {
    const { prompt, pageContent, shopPrompt } = req.body;
    
    // ดึงคีย์จากห้องลับบนเซิร์ฟเวอร์ (คนที่ดูหน้าเว็บจะไม่มีวันเห็นค่านี้)
    const apiKey = process.env.GEMINI_API_KEY; 

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

    // ยิงไปถาม Gemini ตามปกติ...
    const response = await fetch(url, { method: "POST", ... });
    const data = await response.json();

    // ส่งคำตอบกลับไปให้หน้าเว็บลูกค้า
    res.status(200).json({ reply: data.candidates[0].content.parts[0].text });
}