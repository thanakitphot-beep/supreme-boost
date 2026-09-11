const request = require('supertest');
const handler = require('../../server');
const { modelMatchesProvider } = require('../../services/ai/router');
const OpenAIProvider = require('../../services/ai/providers/openai');

test.each(['/server.js', '/package.json', '/services/indicatorAgent.js', '/data/indicator-knowledge.json', '/.vscode/mcp.json', '/evals/generated/manifest.json', '/tools/indicator-mcp/server.js'])('internal file is not public: %s', async url => {
    expect((await request(handler).get(url)).status).toBe(404);
});
test.each(['/index.html', '/manifest.json', '/supreme-boost/boost.js', '/styles/indicator-ui.css'])('public asset still loads: %s', async url => {
    expect((await request(handler).get(url)).status).toBe(200);
});
test('fine-tuned OpenAI model IDs remain on the OpenAI route', () => {
    expect(modelMatchesProvider('openai', 'ft:gpt-4.1-mini-2025-04-14:org:indicator:abc')).toBe(true);
    expect(modelMatchesProvider('groq', 'ft:gpt-4.1-mini-2025-04-14:org:indicator:abc')).toBe(false);
});
test('OpenAI respects deterministic temperature zero', async () => {
    const original = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"reply":"ok"}' } }] }) });
    try {
        await new OpenAIProvider({ apiKey: 'test' }).generate({ system: 's', messages: [] }, { temperature: 0 });
        expect(JSON.parse(global.fetch.mock.calls[0][1].body).temperature).toBe(0);
    } finally { global.fetch = original; }
});
