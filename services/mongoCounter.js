'use strict';

function valueAtPath(document, path) {
    return String(path).split('.').reduce((value, key) => value && value[key], document);
}

function objectAtPath(path, value) {
    const result = {};
    const keys = String(path).split('.');
    let cursor = result;
    keys.forEach((key, index) => {
        if (index === keys.length - 1) cursor[key] = value;
        else cursor = cursor[key] = {};
    });
    return result;
}

function updatedDocument(result) {
    if (!result) return null;
    return Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result;
}

async function incrementBoundedCounter(collection, identity, field, limit, insertFields = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
        const result = await collection.findOneAndUpdate(
            {
                ...identity,
                $or: [{ [field]: { $exists: false } }, { [field]: { $lt: limit } }]
            },
            { $inc: { [field]: 1 } },
            { returnDocument: 'after' }
        );
        const updated = updatedDocument(result);
        if (updated) return { allowed: true, count: Number(valueAtPath(updated, field) || 0) };

        const existing = await collection.findOne(identity, { projection: { [field]: 1 } });
        const count = Number(valueAtPath(existing, field) || 0);
        if (existing && count >= limit) return { allowed: false, count };
        if (existing) continue;

        try {
            await collection.insertOne({ ...identity, ...insertFields, ...objectAtPath(field, 1) });
            return { allowed: true, count: 1 };
        } catch (error) {
            if (!error || error.code !== 11000) throw error;
        }
    }

    const existing = await collection.findOne(identity, { projection: { [field]: 1 } });
    const count = Number(valueAtPath(existing, field) || 0);
    if (existing && count >= limit) return { allowed: false, count };
    throw new Error('Atomic counter contention exceeded retry limit');
}

module.exports = { incrementBoundedCounter };
