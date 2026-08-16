const aiGateway = require('../../services/ai/gateway');
const { validateResponse } = require('../../services/ai/responseValidator');

describe('INDICATOR AI System Tests', () => {
    
    test('Response Validator should correctly identify valid JSON', () => {
        const rawJson = '```json\n{"reply": "สวัสดีครับ", "cssCommand": "", "action": null, "interactive": null}\n```';
        const result = validateResponse(rawJson, 'req_test_123');
        expect(result.isValid).toBe(true);
        expect(result.parsed.reply).toBe('สวัสดีครับ');
    });

    test('Response Validator should reject invalid JSON', () => {
        const rawJson = 'This is just some text';
        const result = validateResponse(rawJson, 'req_test_456');
        expect(result.isValid).toBe(false);
    });

    // Mocking provider calls for integration testing would go here
    // For now, ensuring the structure supports future expansion to 500+ cases
    test('Gateway handles missing memory gracefully', async () => {
        const result = await aiGateway.generate({
            identity: { name: 'INDICATOR', role: 'Assistant' },
            memory: [],
            userMessage: 'Hello'
        });
        
        expect(result).toBeDefined();
        // Since no API keys are passed in the test env, it should fallback to the error response
        expect(result.status).toBe('error');
    }, 15000);
});
