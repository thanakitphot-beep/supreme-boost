const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) return cachedDb;

    const uri = process.env.MONGODB_URI || "mongodb://INDICATOR:tewa1212@ac-pktawwq-shard-00-00.8zefaqw.mongodb.net:27017,ac-pktawwq-shard-00-01.8zefaqw.mongodb.net:27017,ac-pktawwq-shard-00-02.8zefaqw.mongodb.net:27017/indicator_db?ssl=true&replicaSet=atlas-yedqa6-shard-0&authSource=admin&retryWrites=true&w=majority";
    if (!uri) {
        console.warn("MONGODB_URI is not set in environment variables.");
        return null;
    }

    if (!cachedClient) {
        cachedClient = new MongoClient(uri);
        await cachedClient.connect();
    }
    
    let dbName = 'indicator_db';
    try {
        const urlObj = new URL(uri);
        if (urlObj.pathname && urlObj.pathname !== '/') {
            dbName = urlObj.pathname.replace('/', '');
        }
    } catch(e) {}
    
    cachedDb = cachedClient.db(dbName);
    return cachedDb;
}

module.exports = { connectToDatabase };
