// Compatibility entry for older notes that pointed to Node.js.
// The real serverless handler lives in api/chat.js.

module.exports = require("./api/chat.js");
