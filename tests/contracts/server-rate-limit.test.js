const previousBurst = process.env.RATE_LIMIT_BURST;
const previousMax = process.env.RATE_LIMIT_MAX_REQUESTS;

process.env.RATE_LIMIT_BURST = '1';
process.env.RATE_LIMIT_MAX_REQUESTS = '1';

const request = require('supertest');
const handleRequest = require('../../server');

afterAll(() => {
    if (previousBurst === undefined) delete process.env.RATE_LIMIT_BURST;
    else process.env.RATE_LIMIT_BURST = previousBurst;
    if (previousMax === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS;
    else process.env.RATE_LIMIT_MAX_REQUESTS = previousMax;
});

describe('Render request rate limiting', () => {
    test('does not spend API rate-limit tokens on static admin pages', async () => {
        const first = await request(handleRequest)
            .get('/admin')
            .set('X-Forwarded-For', '198.51.100.10');
        const second = await request(handleRequest)
            .get('/admin')
            .set('X-Forwarded-For', '198.51.100.10');

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(first.headers['x-ratelimit-limit']).toBeUndefined();
        expect(second.headers['x-ratelimit-limit']).toBeUndefined();
    });

    test('charges an admin API request only once', async () => {
        const first = await request(handleRequest)
            .get('/api/admin?action=stats')
            .set('X-Forwarded-For', '198.51.100.11');
        const second = await request(handleRequest)
            .get('/api/admin?action=stats')
            .set('X-Forwarded-For', '198.51.100.11');

        expect(first.status).toBe(401);
        expect(first.body).toEqual({ error: 'Unauthorized' });
        expect(first.headers['x-ratelimit-limit']).toBe('1');
        expect(first.headers['x-ratelimit-remaining']).toBe('0');
        expect(second.status).toBe(429);
    });

    test('continues to rate limit unknown API routes', async () => {
        const first = await request(handleRequest)
            .get('/api/not-a-real-route')
            .set('X-Forwarded-For', '198.51.100.13');
        const second = await request(handleRequest)
            .get('/api/not-a-real-route')
            .set('X-Forwarded-For', '198.51.100.13');

        expect(first.status).toBe(404);
        expect(first.headers['x-ratelimit-limit']).toBe('1');
        expect(second.status).toBe(429);
    });
});
