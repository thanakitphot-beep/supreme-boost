class BaseProvider {
    constructor(config) {
        this.config = config;
    }

    /**
     * @param {Object} payload
     * @param {string} payload.system - System instruction
     * @param {Array} payload.messages - Array of { role, content }
     * @param {Object} payload.schema - JSON Schema for structured output
     * @param {Object} options - Provider specific options
     * @returns {Promise<string>} Raw string response from the model
     */
    async generate(payload, options = {}) {
        throw new Error('generate() must be implemented by subclass');
    }
}

module.exports = BaseProvider;
