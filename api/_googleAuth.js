const { OAuth2Client } = require('google-auth-library');

let client = null;
let clientId = '';

function configuredClientId() {
    return String(process.env.GOOGLE_CLIENT_ID || '').trim();
}

function googleClient() {
    const configured = configuredClientId();
    if (!configured) return null;
    if (!client || clientId !== configured) {
        client = new OAuth2Client(configured);
        clientId = configured;
    }
    return client;
}

async function verifyGoogleCredential(credential) {
    const oauthClient = googleClient();
    if (!oauthClient) return { error: 'Google Sign-In is not configured' };
    if (typeof credential !== 'string' || credential.length < 20) return { error: 'Invalid Google credential' };

    try {
        const ticket = await oauthClient.verifyIdToken({ idToken: credential, audience: configuredClientId() });
        const payload = ticket.getPayload() || {};
        if (!payload.sub || !payload.email || payload.email_verified !== true) return { error: 'Google account email is not verified' };
        return {
            profile: {
                sub: String(payload.sub),
                email: String(payload.email).toLowerCase(),
                name: String(payload.name || '').slice(0, 200),
                picture: String(payload.picture || '').slice(0, 1000)
            }
        };
    } catch (_) {
        return { error: 'Google credential is invalid or expired' };
    }
}

module.exports = { configuredClientId, verifyGoogleCredential };
