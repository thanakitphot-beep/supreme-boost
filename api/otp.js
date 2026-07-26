const crypto = require('crypto');
const nodemailer = require('nodemailer');

const { saveOtp, getOtp, deleteOtp } = require('./_db.js');

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT == '465', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

module.exports = async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const { action, email, otp } = body;

            if (!email) {
                return res.status(400).json({ error: "Email is required" });
            }

            // 1. Request OTP
            if (action === 'request') {
                // Generate a 6-digit OTP
                const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
                
                // Store OTP with 5 minutes expiration in MongoDB
                const expiresAt = Date.now() + 5 * 60 * 1000;
                await saveOtp(email, generatedOtp, expiresAt);

                // Send email
                if (process.env.SMTP_USER && process.env.SMTP_PASS) {
                    try {
                        await transporter.sendMail({
                            from: process.env.SMTP_FROM || `"INDICATOR WEB CHAT" <${process.env.SMTP_USER}>`,
                            to: email,
                            subject: "รหัสยืนยันตัวตน (OTP) สำหรับการสมัครสมาชิก INDICATOR",
                            text: `รหัส OTP ของคุณคือ: ${generatedOtp}\n\nรหัสนี้จะหมดอายุภายใน 5 นาที\nหากคุณไม่ได้ทำการสมัครสมาชิก กรุณาเพิกเฉยต่ออีเมลฉบับนี้`,
                            html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; text-align: center;">
                                    <h2 style="color: #0ea5e9;">INDICATOR WEB CHAT</h2>
                                    <p style="color: #475569; font-size: 16px;">รหัสยืนยันตัวตน (OTP) ของคุณสำหรับการสมัครสมาชิกคือ</p>
                                    <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                        <h1 style="margin: 0; font-size: 32px; letter-spacing: 5px; color: #1e293b;">${generatedOtp}</h1>
                                    </div>
                                    <p style="color: #64748b; font-size: 14px;">รหัสนี้จะหมดอายุภายใน 5 นาที</p>
                                    <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>
                                   </div>`
                        });
                        console.log(`[OTP] Email sent to ${email}`);
                    } catch (emailError) {
                        console.error("[OTP] Email send failed:", emailError);
                        return res.status(500).json({ error: "ไม่สามารถส่งอีเมลได้ กรุณาตรวจสอบการตั้งค่าอีเมลของเซิร์ฟเวอร์" });
                    }
                } else {
                    // Fallback to console log if no SMTP configured (useful for local dev before setup)
                    console.log(`[OTP-WARNING] SMTP not configured. Generated OTP for ${email}: ${generatedOtp}`);
                    // return res.status(500).json({ error: "SMTP not configured on server" }); 
                    // Uncomment above line to force failure if no SMTP, or keep logging for dev
                }

                return res.status(200).json({
                    success: true,
                    message: "OTP sent successfully"
                    // removed mockOtp to prevent exposing it to frontend
                });
            }

            // 2. Verify OTP
            if (action === 'verify') {
                if (!otp) {
                    return res.status(400).json({ error: "OTP is required for verification" });
                }

                const storedData = await getOtp(email);
                
                if (!storedData) {
                    return res.status(400).json({ error: "No OTP requested for this email" });
                }

                if (Date.now() > storedData.expiresAt) {
                    await deleteOtp(email);
                    return res.status(400).json({ error: "OTP has expired. Please request a new one." });
                }

                if (storedData.otp !== otp) {
                    return res.status(400).json({ error: "Invalid OTP" });
                }

                // OTP is correct
                await deleteOtp(email); // Clear OTP after successful verification

                return res.status(200).json({
                    success: true,
                    message: "OTP verified successfully"
                });
            }

            return res.status(400).json({ error: "Invalid action" });
        }
        
        return res.status(405).json({ error: "Method not allowed" });
    } catch (error) {
        console.error("OTP API Error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
