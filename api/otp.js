const crypto = require('crypto');

// In-memory OTP storage (for development/mock purposes)
// Format: { 'email@example.com': { otp: '123456', expiresAt: 167... } }
const otpStorage = {};

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

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
                
                // Store OTP with 5 minutes expiration
                otpStorage[email] = {
                    otp: generatedOtp,
                    expiresAt: Date.now() + 5 * 60 * 1000 // 5 mins
                };

                // For mock purposes, we log it and return it in the response so frontend can show it
                console.log(`[OTP] Generated OTP for ${email}: ${generatedOtp}`);

                return res.status(200).json({
                    success: true,
                    message: "OTP sent successfully (Mock mode)",
                    mockOtp: generatedOtp // Remove this in production when real email is used
                });
            }

            // 2. Verify OTP
            if (action === 'verify') {
                if (!otp) {
                    return res.status(400).json({ error: "OTP is required for verification" });
                }

                const storedData = otpStorage[email];
                
                if (!storedData) {
                    return res.status(400).json({ error: "No OTP requested for this email" });
                }

                if (Date.now() > storedData.expiresAt) {
                    delete otpStorage[email];
                    return res.status(400).json({ error: "OTP has expired. Please request a new one." });
                }

                if (storedData.otp !== otp) {
                    return res.status(400).json({ error: "Invalid OTP" });
                }

                // OTP is correct
                delete otpStorage[email]; // Clear OTP after successful verification

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
