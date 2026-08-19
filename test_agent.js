const { runIndicatorAgent } = require('./services/indicatorAgent');

// Test 1: Basic greeting
let r = runIndicatorAgent({
  prompt: 'สวัสดี',
  siteDNA: {},
  pageContent: '',
  history: [],
  locale: 'th',
  url: 'https://example.com'
});
console.log('[Test 1 - Greeting]', r.status, '|', r.reply ? r.reply.slice(0, 60) : 'NO REPLY');

// Test 2: Warp with structured entity
r = runIndicatorAgent({
  prompt: 'หาเสื้อสีแดง',
  siteDNA: {
    entityIndex: [
      { id: 'product-1', title: 'เสื้อสีแดง', price: 299, inStock: true, href: '/products/1' }
    ],
    headings: [],
    entities: []
  },
  pageContent: '',
  history: [],
  locale: 'th',
  url: 'https://example.com'
});
console.log('[Test 2 - Warp Entity]', r.status, '|', r.action ? JSON.stringify(r.action) : 'NO ACTION', '|', r.reply ? r.reply.slice(0, 60) : 'NO REPLY');

// Test 3: Cross-page warp (no entity match)
r = runIndicatorAgent({
  prompt: 'ราคาสินค้า',
  siteDNA: { headings: [], entities: [], entityIndex: [] },
  pageContent: '',
  history: [],
  locale: 'th',
  url: 'https://example.com'
});
console.log('[Test 3 - No Match]', r.status, '|', r.action ? r.action.type : 'NO ACTION', '|', r.reply ? r.reply.slice(0, 60) : 'NO REPLY');

// Test 4: Knowledge/catalog match
const { expertKnowledge: _ek, ...cleanPayload } = {
  prompt: 'มีสินค้าอะไรบ้าง',
  siteDNA: {},
  pageContent: 'เสื้อยืด ราคา 199 บาท กางเกง ราคา 399 บาท',
  history: [],
  locale: 'th',
  url: 'https://example.com'
};
r = runIndicatorAgent(cleanPayload);
console.log('[Test 4 - Page Content]', r.status, '|', r.reply ? r.reply.slice(0, 80) : 'NO REPLY');

console.log('\n✅ All tests complete');
