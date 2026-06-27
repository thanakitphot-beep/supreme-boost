const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
env.split('\n').forEach(line => {
    if (line.includes('=')) {
        const [k, v] = line.split('=');
        process.env[k.trim()] = v.trim();
    }
});
const handler = require('../api/admin');

async function runLocal() {
    const req = {
        method: 'POST',
        url: '/api/admin?action=add_tenant',
        headers: {
            host: 'localhost',
            authorization: 'Bearer ADMIN_SUPREME_TOKEN_12345'
        },
        body: {
            company_name: 'Test Local',
            package_type: 'basic',
            duration_months: '6'
        }
    };
    
    let statusCode = 200;
    let jsonResponse = null;

    const res = {
        setHeader: () => {},
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            jsonResponse = data;
        },
        end: () => {}
    };

    try {
        await handler(req, res);
        console.log("Status Code:", statusCode);
        console.log("Response:", jsonResponse);
    } catch(e) {
        console.error("Uncaught exception:", e);
    }
}

runLocal();
