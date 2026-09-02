const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { checkRateLimit } = require('../services/rateLimit');
const { setCorsHeaders } = require('../services/cors');
const { createEmailVerificationToken } = require('../services/otpVerification');

const {
    saveOtp,
    getOtp,
    attemptOtp,
    deleteOtp
} = require('./_db.js');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const EMAIL_TIMEOUT_MS = 10_000;

function signingSecret() {
    return process.env.OTP_SIGNING_SECRET || process.env.JWT_SECRET || '';
}

const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

// SMTP remains available for paid/self-hosted deployments. Render Free blocks
// common SMTP ports, so production can use the Brevo HTTPS API instead.
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    connectionTimeout: EMAIL_TIMEOUT_MS,
    greetingTimeout: EMAIL_TIMEOUT_MS,
    socketTimeout: EMAIL_TIMEOUT_MS,
});

function emailContent(otp) {
    return {
        subject: 'รหัสยืนยันตัวตน (OTP) สำหรับการสมัครสมาชิก INDICATOR',
        text: `รหัส OTP ของคุณคือ: ${otp}\n\nรหัสนี้จะหมดอายุภายใน 5 นาที\nหากคุณไม่ได้ทำการสมัครสมาชิก กรุณาเพิกเฉยต่ออีเมลฉบับนี้`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; text-align: center;">
                <h2 style="color: #0ea5e9;">INDICATOR WEB CHAT</h2>
                <p style="color: #475569; font-size: 16px;">รหัสยืนยันตัวตน (OTP) ของคุณสำหรับการสมัครสมาชิกคือ</p>
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h1 style="margin: 0; font-size: 32px; letter-spacing: 5px; color: #1e293b;">${otp}</h1>
                </div>
                <p style="color: #64748b; font-size: 14px;">รหัสนี้จะหมดอายุภายใน 5 นาที</p>
                <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>
               </div>`
    };
}

function parseSender(value) {
    const sender = String(value || '').trim();
    const match = sender.match(/^\s*"?([^"<]*)"?\s*<([^<>]+)>\s*$/);
    if (match) return { name: match[1].trim() || 'INDICATOR WEB CHAT', email: match[2].trim() };
    return { name: 'INDICATOR WEB CHAT', email: sender };
}

async function sendWithBrevo(email, content) {
    const sender = parseSender(process.env.BREVO_FROM || process.env.SMTP_FROM || process.env.SMTP_USER);
    if (!sender.email) throw new Error('Brevo sender email is not configured');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
    timeout.unref?.();
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                sender,
                to: [{ email }],
                subject: content.subject,
                textContent: content.text,
                htmlContent: content.html,
                tags: ['otp']
            }),
            signal: controller.signal
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(`Brevo email API failed (${response.status}): ${body.message || body.code || 'unknown error'}`);
        }
    } finally {
        clearTimeout(timeout);
    }
}

async function sendOtpEmail(email, otp) {
    const content = emailContent(otp);
    if (process.env.BREVO_API_KEY) {
        await sendWithBrevo(email, content);
        return;
    }
    if (String(process.env.OTP_EMAIL_PROVIDER || '').toLowerCase() === 'brevo') {
        throw new Error('BREVO_API_KEY is not configured');
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('Email provider is not configured');
    }
    let timeout;
    try {
        await Promise.race([
            transporter.sendMail({
                from: process.env.SMTP_FROM || `"INDICATOR WEB CHAT" <${process.env.SMTP_USER}>`,
                to: email,
                subject: content.subject,
                text: content.text,
                html: content.html
            }),
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('SMTP delivery timed out')), EMAIL_TIMEOUT_MS);
                timeout.unref?.();
            })
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = async function handler(req, res) {
    if (!setCorsHeaders(req, res) && req.headers.origin) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === "OPTIONS") return res.status(200).end();

    if (!req._rateLimitChecked && !checkRateLimit(req, res, 'auth')) return;

    try {
        if (req.method === "POST") {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const { action } = body;
            const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
            const email = String(body.email || '').trim().toLowerCase();

            if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ error: "กรุณากรอกอีเมลให้ถูกต้อง" });
            }
            if (!signingSecret()) {
                return res.status(503).json({ error: "ระบบยืนยัน OTP ยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแล" });
            }

            // 1. Request OTP
            if (action === 'request') {
                const now = Date.now();
                try {
                    const previous = await getOtp(email);
                    const createdAt = previous && Date.parse(previous.created_at);
                    if (Number.isFinite(createdAt) && now - createdAt < OTP_RESEND_COOLDOWN_MS) {
                        const retryAfter = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - createdAt)) / 1000);
                        res.setHeader('Retry-After', String(retryAfter));
                        return res.status(429).json({ error: `กรุณารอ ${retryAfter} วินาทีก่อนขอ OTP ใหม่`, retryAfter });
                    }
                } catch (_) { }

                const generatedOtp = crypto.randomInt(100000, 1000000).toString();
                const challengeId = crypto.randomUUID();
                const expiresAt = now + OTP_TTL_MS;
                let savedToMongo = false;
                try {
                    savedToMongo = await saveOtp(email, generatedOtp, expiresAt, challengeId, OTP_RESEND_COOLDOWN_MS);
                } catch (dbErr) {
                    console.warn('[OTP] MongoDB saveOtp failed:', dbErr.message);
                }

                if (savedToMongo === false) {
                    res.setHeader('Retry-After', String(OTP_RESEND_COOLDOWN_MS / 1000));
                    return res.status(429).json({ error: "กรุณารอก่อนขอ OTP ใหม่", retryAfter: OTP_RESEND_COOLDOWN_MS / 1000 });
                }
                if (!savedToMongo) {
                    return res.status(503).json({ error: "ระบบบันทึก OTP ไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง" });
                }

                try {
                    await sendOtpEmail(email, generatedOtp);
                    console.log(`[OTP] Email sent to ${email}`);
                } catch (emailError) {
                    console.error('[OTP] Email send failed:', emailError.message);
                    await deleteOtp(email, challengeId).catch(() => {});
                    return res.status(503).json({ error: "ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
                }

                return res.status(200).json({
                    success: true,
                    message: "OTP sent successfully",
                    expiresIn: OTP_TTL_MS / 1000
                });
            }

            // 2. Verify OTP
            if (action === 'verify') {
                if (!/^\d{6}$/.test(otp)) {
                    return res.status(400).json({ error: "กรุณากรอก OTP เป็นตัวเลข 6 หลัก" });
                }

                const verificationToken = createEmailVerificationToken(email);
                let mongoVerified = false;
                try {
                    const attempt = await attemptOtp(email, otp, verificationToken, Date.now() + OTP_TTL_MS, OTP_MAX_ATTEMPTS);
                    if (attempt && attempt.verified) mongoVerified = true;
                    if (attempt && !attempt.verified) {
                        if (attempt.document.attempts >= OTP_MAX_ATTEMPTS) {
                            await deleteOtp(email, attempt.document.challengeId).catch(() => {});
                            return res.status(429).json({ error: "กรอก OTP ผิดเกินจำนวนที่กำหนด กรุณาขอรหัสใหม่" });
                        }
                        return res.status(400).json({ error: "Invalid OTP" });
                    }
                    const storedData = mongoVerified ? null : await getOtp(email);
                    if (storedData) {
                        if (Date.now() > storedData.expiresAt) {
                            await deleteOtp(email, storedData.challengeId).catch(() => {});
                            return res.status(400).json({ error: "OTP has expired. Please request a new one." });
                        }
                        if (storedData.attempts >= OTP_MAX_ATTEMPTS) {
                            await deleteOtp(email, storedData.challengeId).catch(() => {});
                            return res.status(429).json({ error: "กรอก OTP ผิดเกินจำนวนที่กำหนด กรุณาขอรหัสใหม่" });
                        }
                    }
                } catch (dbErr) {
                    console.warn('[OTP] MongoDB OTP verification failed:', dbErr.message);
                    return res.status(503).json({ error: "ระบบตรวจสอบ OTP ไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง" });
                }

                if (!mongoVerified) return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });

                return res.status(200).json({
                    success: true,
                    message: "OTP verified successfully",
                    verificationToken
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
