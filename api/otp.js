const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');

const { saveOtp, getOtp, deleteOtp } = require('./_db.js');

const OTP_COOKIE = 'indicator_otp_challenge';
const OTP_TTL_MS = 5 * 60 * 1000;

// ── Cookie-based fallback (ใช้เมื่อ MongoDB ไม่พร้อม) ──────────────────────
function signingSecret() {
    return process.env.OTP_SIGNING_SECRET || process.env.JWT_SECRET || '';
}

function signChallenge(email, otp, expiresAt) {
    return crypto.createHmac('sha256', signingSecret()).update(`${email}\n${otp}\n${expiresAt}`).digest('base64url');
}

function setOtpChallenge(res, email, otp) {
    const secret = signingSecret();
    if (!secret) return false;
    const expiresAt = Date.now() + OTP_TTL_MS;
    const value = `${Buffer.from(email, 'utf8').toString('base64url')}.${expiresAt}.${signChallenge(email, otp, expiresAt)}`;
    const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${OTP_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/api/otp; Max-Age=300${secure}`);
    return true;
}

function clearOtpChallenge(res) {
    const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${OTP_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/otp; Max-Age=0${secure}`);
}

function readCookie(req, name) {
    const prefix = `${name}=`;
    const entry = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
    if (!entry) return '';
    try { return decodeURIComponent(entry.slice(prefix.length)); } catch { return ''; }
}

function verifyOtpChallenge(req, email, otp) {
    if (!signingSecret()) return false;
    const parts = readCookie(req, OTP_COOKIE).split('.');
    if (parts.length !== 3) return false;
    const [encodedEmail, expiresAtText, signature] = parts;
    const expiresAt = Number(expiresAtText);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
    let challengeEmail = '';
    try { challengeEmail = Buffer.from(encodedEmail, 'base64url').toString('utf8'); } catch { return false; }
    if (challengeEmail !== email) return false;
    const expected = signChallenge(email, otp, expiresAt);
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT == '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

module.exports = async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") return res.status(200).end();

    if (!checkRateLimit(req, res, 'auth')) return;

    try {
        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const { action, email, otp } = body;

            if (!email) {
                return res.status(400).json({ error: "Email is required" });
            }

            // 1. Request OTP
            if (action === 'request') {
                const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
                const expiresAt = Date.now() + OTP_TTL_MS;

                // ลอง save ใน MongoDB ก่อน ถ้าล้มเหลว fallback ไปใช้ signed cookie
                let savedToMongo = false;
                try {
                    savedToMongo = await saveOtp(email, generatedOtp, expiresAt);
                } catch (dbErr) {
                    console.warn('[OTP] MongoDB saveOtp failed, falling back to cookie:', dbErr.message);
                }

                if (!savedToMongo) {
                    if (!setOtpChallenge(res, email, generatedOtp)) {
                        return res.status(503).json({ error: "OTP service is temporarily unavailable. Please try again later." });
                    }
                }

                // ส่งอีเมล
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
                        return res.status(503).json({ error: "ไม่สามารถส่งอีเมลได้ กรุณาตรวจสอบการตั้งค่าอีเมลของเซิร์ฟเวอร์" });
                    }
                } else {
                    console.log(`[OTP-WARNING] SMTP not configured. Generated OTP for ${email}: ${generatedOtp}`);
                }

                return res.status(200).json({
                    success: true,
                    message: "OTP sent successfully"
                });
            }

            // 2. Verify OTP
            if (action === 'verify') {
                if (!otp) {
                    return res.status(400).json({ error: "OTP is required for verification" });
                }

                // ลองหาใน MongoDB ก่อน ถ้าล้มเหลว/ไม่มีข้อมูล ให้ตรวจ cookie
                let mongoVerified = null; // null = ไม่ได้ใช้ MongoDB, true/false = ผลการ verify
                try {
                    const storedData = await getOtp(email);
                    if (storedData) {
                        // พบข้อมูลใน MongoDB → ตรวจสอบ
                        if (Date.now() > storedData.expiresAt) {
                            await deleteOtp(email).catch(() => {});
                            return res.status(400).json({ error: "OTP has expired. Please request a new one." });
                        }
                        if (storedData.otp !== otp) {
                            return res.status(400).json({ error: "Invalid OTP" });
                        }
                        await deleteOtp(email).catch(() => {});
                        mongoVerified = true;
                    }
                } catch (dbErr) {
                    console.warn('[OTP] MongoDB getOtp failed, trying cookie fallback:', dbErr.message);
                }

                if (mongoVerified === null) {
                    // ไม่มีข้อมูลใน MongoDB หรือ MongoDB ล้มเหลว → ตรวจจาก cookie
                    if (!verifyOtpChallenge(req, email, otp)) {
                        return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
                    }
                    clearOtpChallenge(res);
                }

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
