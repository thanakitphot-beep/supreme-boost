const fetch = require('node-fetch');

async function testAddTenant() {
    try {
        const url = 'https://test-mu-cyan-21.vercel.app/api/admin?action=add_tenant';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ADMIN_SUPREME_TOKEN_12345'
            },
            body: JSON.stringify({
                company_name: 'Test Infinix',
                package_type: 'Pro Matrix',
                duration_months: '6'
            })
        });
        
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("Response:", data);
    } catch(e) {
        console.error(e);
    }
}

testAddTenant();
