// api/auth.js — Route shim for /api/auth
// This file re-exports the actual implementation from _auth.js
// Fixes: server.js mapped '/api/auth' but the file was named '_auth.js'
module.exports = require('./_auth.js');
