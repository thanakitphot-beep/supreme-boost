const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedConnection = null;
let cachedDb = null;

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function connectToDatabase() {
    if (cachedDb) return cachedDb;

    const uri = String(process.env.MONGODB_URI || '').trim();
    if (!uri) return null;

    if (!cachedConnection) {
        const client = new MongoClient(uri, {
            maxPoolSize: positiveInteger(process.env.MONGODB_MAX_POOL_SIZE, 5),
            serverSelectionTimeoutMS: positiveInteger(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 5000),
            connectTimeoutMS: positiveInteger(process.env.MONGODB_CONNECT_TIMEOUT_MS, 5000)
        });

        cachedConnection = client.connect()
            .then(() => {
                cachedClient = client;
                return client;
            })
            .catch(async () => {
                cachedConnection = null;
                cachedClient = null;
                try { await client.close(); } catch (_) { }
                throw new Error('Database connection failed');
            });
    }

    try {
        const client = cachedClient || await cachedConnection;
        cachedDb = client.db(String(process.env.MONGODB_DB_NAME || '').trim() || undefined);
        return cachedDb;
    } catch (_) {
        return null;
    }
}

module.exports = { connectToDatabase };
