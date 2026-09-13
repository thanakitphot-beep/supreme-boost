'use strict';
// Deterministic fictional data, never customer conversations. Twelve scenario
// families share templates: volume is not proof of general language coverage.
const path = require('node:path');
const { buildTrainingCorpus } = require('./agent-training.cases');
const { writeArtifacts } = require('./prepare-agent-training');
function buildLargeCorpus() {
    const categories = ['สมุด', 'โคมไฟ', 'กระเป๋า', 'กล่อง', 'แก้วน้ำ', 'หมอน', 'ผ้าคลุม', 'นาฬิกา', 'ตะกร้า', 'จาน', 'พรม', 'ขวดน้ำ'];
    const fixtures = Array.from({ length: 1200 }, (_, i) => {
        const price = 50 + ((i * 137) % 1950);
        return { id: 'synthetic-' + i, split: i % 10 < 8 ? 'train' : i % 10 === 8 ? 'validation' : 'holdout',
            name: 'ร้านสมมติหมายเลข ' + (i + 1), first: categories[i % categories.length] + ' รุ่นสายลม ' + (i + 1), second: categories[i % categories.length] + ' รุ่นแสงดาว ' + (i + 1),
            price, otherPrice: price + 20 + ((i * 31) % 900), weight: 50 + (i * 19 % 800), otherWeight: 1000 + (i * 23 % 800),
            shipping: 15 + (i * 7 % 100), freeAt: price * (2 + i % 5), opens: String(6 + i % 6).padStart(2, '0') + ':00',
            closes: String(16 + i % 6).padStart(2, '0') + ':30', returns: 7 + i % 24 };
    });
    return buildTrainingCorpus(fixtures).map((example, index) => {
        const i = Math.floor(index / 12), s = fixtures[i], skill = example.skills[0];
        const forms = {
            hours: [`วันอาทิตย์ ${s.name} เปิดกี่โมง ปิดกี่โมงครับ`, `${s.name} วันอาทิตเปิดปิดตอนไหนอะ`, `ขอเวลาเปิดปิดวันอาทิตย์ของ ${s.name} หน่อยค่ะ`],
            comparison: [`เทียบราคา+น้ำหนัก ${s.first} กับ ${s.second} แล้วบอกด้วยตัวไหนเบา`, `${s.first} กับ ${s.second} ราคาและน้ำหนักเท่าไร อันไหนเบากว่าคะ`],
            'shipping-total': [`${s.first} 1 ชิ้น รวมค่าส่งเท่าไหร่ครับ`, `เอา ${s.first} หนึ่งอัน ต้องจ่ายกี่บาทรวมส่งนะ`],
            'missing-stock': [`ตอนนี้ ${s.second} เหลือกี่ชิ้น ยืนยันให้หน่อย`, `${s.second} มีของกี่ชิ้นอะ เช็กจากข้อมูลร้านให้ที`],
            'human-handoff': [`ขอคุยกับเจ้าหน้าที่ ${s.name} ครับ`, `ส่งต่อให้พนักงาน ${s.name} หน่อยค่ะ`, `อยากติดต่อคนจริงที่ ${s.name} ช่วยส่งต่อให้ที`]
        };
        if (forms[skill]) example.prompt = forms[skill][i % forms[skill].length];
        return example;
    });
}
if (require.main === module) {
    const output = path.join(__dirname, 'generated-large');
    const manifest = writeArtifacts(output, buildLargeCorpus());
    console.log(JSON.stringify({ output, examples: manifest.examples, splits: manifest.splits, corpusHash: manifest.corpusHash, limitation: manifest.limitation }, null, 2));
}
module.exports = { buildLargeCorpus };
