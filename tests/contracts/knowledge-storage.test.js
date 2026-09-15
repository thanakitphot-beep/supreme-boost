jest.mock('../../api/_mongodb', () => ({ connectToDatabase: jest.fn() }));
const { connectToDatabase } = require('../../api/_mongodb');
const storage = require('../../api/_db');
describe('scoped persistent knowledge writes', () => {
    const collection = { updateOne: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn(), deleteMany: jest.fn() };
    beforeEach(() => { jest.clearAllMocks(); connectToDatabase.mockResolvedValue({ collection: () => collection }); collection.findOne.mockResolvedValue({ id: 'saved' }); collection.deleteOne.mockResolvedValue({ deletedCount: 1 }); });
    test('upserts under tenant, source and chunk index and keeps provenance', async () => {
        await storage.upsertKnowledge({ tenantId: 'a', url: 'text:policy', chunkIndex: 0, title: 'Policy', content: 'Known facts', sourceType: 'tenant_text', sourceHash: 'hash' });
        expect(collection.updateOne).toHaveBeenCalledWith({ tenant_id: 'a', url: 'text:policy', chunk_index: 0 }, expect.objectContaining({ $set: expect.objectContaining({ content: 'Known facts', source_hash: 'hash' }) }), { upsert: true });
    });
    test('never deletes without tenant scope', async () => {
        expect(await storage.deleteKnowledge('id')).toBe(false); expect(collection.deleteOne).not.toHaveBeenCalled();
        expect(await storage.deleteKnowledge('id', 'a')).toBe(true);
        expect(collection.deleteOne).toHaveBeenCalledWith({ id: 'id', tenant_id: 'a' });
    });
    test('only retires the old tail of the same tenant and source', async () => {
        await storage.retireKnowledgeAfterIndex('a', 'text:policy', 4);
        expect(collection.deleteMany).toHaveBeenCalledWith({ tenant_id: 'a', url: 'text:policy', chunk_index: { $gte: 4 } });
    });
});
