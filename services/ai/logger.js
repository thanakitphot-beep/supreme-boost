const crypto = require('crypto');

function generateRequestId() {
    return 'req_' + crypto.randomBytes(12).toString('hex');
}

function logEvent(type, message, metadata = {}) {
    const isDev = process.env.NODE_ENV === 'development';
    
    // Mask sensitive keys
    const safeMetadata = { ...metadata };
    if (safeMetadata.apiKey) safeMetadata.apiKey = '***';
    if (safeMetadata.password) safeMetadata.password = '***';

    const logEntry = {
        timestamp: new Date().toISOString(),
        type,
        message,
        ...safeMetadata
    };

    if (type === 'error' || type === 'warn') {
        console.error(JSON.stringify(logEntry));
    } else if (isDev) {
        console.log(JSON.stringify(logEntry));
    } else {
        // In production, minimize info logs unless explicitly required
        if (safeMetadata.forceLog) {
            console.log(JSON.stringify(logEntry));
        }
    }
}

module.exports = {
    generateRequestId,
    logEvent
};
