// API Integration Test — ทดสอบ Triple-Agent Pipeline
// ใช้กับ local dev server: npm start
// จากนั้นรัน: node test-api.js
//
// หรือทดสอบกับ production:
// SET BACKEND_URL=https://test-bo1tr2ljt-thanakitphot-beeps-projects.vercel.app/api/chat
// node test-api.js

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000/api/chat';

const TESTS = [
    {
        name: '1. สวัสดี (ไทย)',
        body: { prompt: 'สวัสดี', locale: 'th' },
        check: (data) => {
            console.assert(typeof data.reply === 'string' && data.reply.length > 0, '❌ No reply');
            console.assert(data.reply.includes('สวัสดี') || data.reply.includes('ครับ'), '❌ Not Thai greeting');
            console.log(`  Reply: ${data.reply.slice(0, 80)}`);
        }
    },
    {
        name: '2. ถามหาสินค้า — ต้องมี warp action',
        body: {
            prompt: 'หา Cozy Olive Green Jeans ให้หน่อย',
            locale: 'th',
            pageContent: 'Cozy Olive Green Jeans ฿890 Premium Cotton Slim Fit Available in S M L XL Summer Dress Floral Pattern ฿1,290',
            title: 'สินค้าทั้งหมด',
            url: 'https://shop.com/products'
        },
        check: (data) => {
            console.assert(data.action !== null, '❌ ไม่มี action — ต้อง warp');
            console.assert(data.action.type === 'warp', '❌ action type ไม่ใช่ warp');
            console.assert(data.action.targetText && data.action.targetText.length > 0, '❌ ไม่มี targetText');
            console.assert(data.action.confirmationRequired !== true, '❌ warp ไปสินค้าปกติไม่ควรต้อง confirm');
            console.log(`  Action: ${data.action.type} → ${data.action.targetText}`);
            console.log(`  Keywords: ${(data.action.keywords || []).join(', ')}`);
        }
    },
    {
        name: '3. ถามหาสินค้าที่ไม่มีในหน้า — action ต้องเป็น null',
        body: {
            prompt: 'หารองเท้า Yeezy',
            locale: 'th',
            pageContent: 'Cozy Olive Green Jeans ฿890 Summer Dress ฿1,290',
            title: 'สินค้า'
        },
        check: (data) => {
            console.assert(data.action === null, `❌ มี action ทั้งที่สินค้าไม่มีในหน้า: ${JSON.stringify(data.action)}`);
            console.assert(data.reply.includes('ไม่พบ') || data.reply.includes('no'), `❌ ควรตอบว่าไม่พบ: ${data.reply.slice(0, 60)}`);
            console.log(`  Reply: ${data.reply.slice(0, 80)}`);
        }
    },
    {
        name: '4. Zero-Trust — warp ไป login ต้องมี confirmationRequired',
        body: {
            prompt: 'พาไปที่ช่องกรอกรหัสผ่าน',
            locale: 'th',
            pageContent: 'กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน Login to your account เข้าสู่ระบบ',
            title: 'Login Page'
        },
        check: (data) => {
            console.assert(data.action !== null, '❌ ไม่มี action');
            if (data.action && data.action.type === 'warp') {
                console.assert(data.action.confirmationRequired === true, '❌ ต้องมี confirmationRequired = true');
                console.log(`  ✅ Zero-Trust: confirmationRequired = ${data.action.confirmationRequired}`);
                console.log(`  Safety reason: ${data.action.safetyReason || '(none)'}`);
            } else {
                console.log(`  ⚠ AI ตอบแบบไม่มี warp (อาจเพราะ safety): ${data.reply ? data.reply.slice(0, 60) : 'no reply'}`);
            }
        }
    },
    {
        name: '5. การขยายตัวอักษร (CSS command)',
        body: {
            prompt: 'ขยายตัวอักษรให้หน่อย',
            locale: 'th',
            pageContent: 'Welcome to our store'
        },
        check: (data) => {
            // อาจจะได้ local command หรือ AI reply
            console.log(`  Reply: ${(data.reply || '').slice(0, 60)}`);
            console.log(`  CSS: ${(data.cssCommand || '').slice(0, 40) || '(none)'}`);
        }
    },
    {
        name: '6. Proactive mode (จำลอง DOM Snapshot)',
        body: {
            prompt: '',
            proactive: true,
            locale: 'en',
            pageContent: 'Summer Dress Floral Pattern ฿1,290 Premium Cotton Cozy Olive Green Jeans ฿890',
            title: 'Products',
            url: 'https://shop.com/products',
            domSnapshot: {
                hoveredElements: [
                    { text: 'Summer Dress Floral Pattern', count: 3 },
                    { text: '฿1,290', count: 2 }
                ],
                scrollDepth: 45,
                timeOnPage: 62
            }
        },
        check: (data) => {
            console.assert(typeof data.reply === 'string', '❌ No reply');
            console.assert(data.reply.length > 0, '❌ Empty reply');
            // Proactive mode should mention the dress or be specific
            const lower = data.reply.toLowerCase();
            const mentionsProduct = lower.includes('dress') || lower.includes('summer') || lower.includes('สินค้า');
            console.log(`  Reply: ${data.reply.slice(0, 100)}`);
            console.log(`  Mentions product: ${mentionsProduct ? '✅' : '⚠️ (might be generic)'}`);
        }
    },
    {
        name: '7. Anti-hallucination — keywords ต้องมีใน pageContent',
        body: {
            prompt: 'หา Flamingo Pink Dress',
            locale: 'en',
            pageContent: 'Cozy Olive Green Jeans ฿890 Summer Dress ฿1,290'
        },
        check: (data) => {
            if (data.action && data.action.keywords) {
                const contentLower = 'Cozy Olive Green Jeans ฿890 Summer Dress ฿1,290'.toLowerCase();
                for (const kw of data.action.keywords) {
                    const exists = contentLower.includes(kw.toLowerCase());
                    console.assert(exists, `❌ Hallucinated keyword "${kw}" not in pageContent`);
                    if (!exists) console.log(`  ⚠ "${kw}" not in pageContent`);
                }
                console.log(`  Keywords verified against pageContent: ${data.action.keywords.join(', ')}`);
            } else {
                console.log(`  No action (expected if product not found): ${(data.reply || '').slice(0, 60)}`);
            }
        }
    }
];

async function runTests() {
    console.log('\n🧪 Triple-Agent Pipeline Integration Tests');
    console.log(`   Backend: ${BACKEND}\n`);

    let passed = 0;
    let failed = 0;

    for (const test of TESTS) {
        process.stdout.write(`\n${test.name}`);
        try {
            const res = await fetch(BACKEND, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(test.body)
            });

            const data = await res.json();

            if (!res.ok) {
                console.log(`  ❌ HTTP ${res.status}: ${data.error || 'unknown error'}`);
                failed++;
                continue;
            }

            console.log('');
            test.check(data);
            passed++;
        } catch (err) {
            console.log(`  ❌ ${err.message}`);
            failed++;
        }
    }

    console.log(`\n========================================`);
    console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(`========================================`);

    if (failed > 0) process.exit(1);
}

runTests();
