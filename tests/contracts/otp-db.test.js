const crypto = require('crypto');
const { connectToDatabase } = require('../../api/_mongodb.js');
const { saveOtp, attemptOtp, deleteOtp, consumeOtpVerification } = require('../../api/_db.js');

jest.mock('../../api/_mongodb.js', () => ({ connectToDatabase: jest.fn() }));

describe('Atomic OTP persistence', () => {
    let collection;

    beforeEach(() => {
        collection = {
            findOneAndUpdate: jest.fn(),
            findOneAndDelete: jest.fn(),
            deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
        };
        connectToDatabase.mockResolvedValue({ collection: jest.fn(() => collection) });
    });

    test('a new challenge atomically replaces any older verification proof', async () => {
        collection.findOneAndUpdate.mockResolvedValue({ _id: 'legacy-object-id', email: 'user@example.com', challengeId: 'challenge-2' });
        await expect(saveOtp('user@example.com', '123456', 12345, 'challenge-2', 60000)).resolves.toBe(true);
        const [filter, pipeline, options] = collection.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ email: 'user@example.com' });
        expect(pipeline).toHaveLength(1);
        expect(pipeline[0].$set.challengeId.$cond[1]).toBe('challenge-2');
        expect(pipeline[0].$set.createdAtMs.$cond[0]).toEqual({
            $lte: [
                { $convert: { input: '$createdAtMs', to: 'long', onError: 0, onNull: 0 } },
                expect.any(Number)
            ]
        });
        expect(pipeline[0].$set.verificationTokenHash.$cond[1]).toBe('$$REMOVE');
        expect(options).toEqual({ upsert: true, returnDocument: 'after' });
    });

    test('treats a duplicate-key upsert race as an active resend cooldown', async () => {
        collection.findOneAndUpdate
            .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }))
            .mockResolvedValueOnce({ _id: 'legacy-object-id', email: 'user@example.com', challengeId: 'other-challenge' });
        await expect(saveOtp('user@example.com', '123456', 12345, 'challenge-2', 60000)).resolves.toBe(false);
        expect(collection.findOneAndUpdate.mock.calls[1][2]).toEqual({ upsert: false, returnDocument: 'after' });
    });

    test('each guess atomically spends an attempt and a match swaps the OTP for a proof', async () => {
        const token = 'signed-proof';
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        collection.findOneAndUpdate.mockResolvedValue({ _id: 'legacy-object-id', email: 'user@example.com', verificationTokenHash: tokenHash });
        await expect(attemptOtp('user@example.com', '123456', token, 99999, 5)).resolves.toMatchObject({ verified: true });

        const [filter, pipeline, options] = collection.findOneAndUpdate.mock.calls[0];
        expect(filter).toMatchObject({
            email: 'user@example.com',
            expiresAt: { $gt: expect.any(Number) },
            $expr: { $lt: [{ $ifNull: ['$attempts', 0] }, 5] }
        });
        expect(pipeline).toHaveLength(1);
        expect(pipeline[0].$set.verificationTokenHash.$cond).toEqual([
            { $eq: ['$otp', { $literal: '123456' }] },
            tokenHash,
            '$$REMOVE'
        ]);
        expect(pipeline[0].$set.attempts.$cond[2]).toEqual({ $add: [{ $ifNull: ['$attempts', 0] }, 1] });
        expect(options).toEqual({ returnDocument: 'after' });
    });

    test('only the current proof can be consumed and old delivery failures are generation-scoped', async () => {
        collection.findOneAndDelete
            .mockResolvedValueOnce({ _id: 'legacy-object-id', email: 'user@example.com' })
            .mockResolvedValueOnce(null);
        await expect(consumeOtpVerification('user@example.com', 'signed-proof')).resolves.toBe(true);
        await expect(consumeOtpVerification('user@example.com', 'signed-proof')).resolves.toBe(false);

        await deleteOtp('user@example.com', 'old-challenge');
        expect(collection.deleteOne).toHaveBeenCalledWith({ email: 'user@example.com', challengeId: 'old-challenge' });
    });
});
