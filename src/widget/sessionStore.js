"use strict";

// IndexedDB is optional (private browsing and embedded pages can deny it).
// Keep current-session state usable even if persistent storage is unavailable.
function createSessionStore(indexedDB) {
    var database = null, ready = null, memory = Object.create(null);
    function init() {
        if (ready) return ready;
        ready = new Promise(function (resolve) {
            var settled = false;
            var timer = setTimeout(finish, 2000);
            function finish(db) {
                if (settled) { if (db) db.close(); return; }
                settled = true;
                clearTimeout(timer);
                database = db || null;
                resolve();
            }
            try {
                if (!indexedDB) return finish();
                var request = indexedDB.open("SupremeBoost", 1);
                request.onupgradeneeded = function (event) {
                    var db = event.target.result;
                    ["mem", "cart", "prefs"].forEach(function (name) {
                        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "key" });
                    });
                };
                request.onsuccess = function (event) { finish(event.target.result); };
                request.onerror = request.onblocked = function () { finish(); };
            } catch (_) { finish(); }
        });
        return ready;
    }
    function get(store, key) {
        var cacheKey = store + ":" + key;
        return init().then(function () {
            if (Object.prototype.hasOwnProperty.call(memory, cacheKey)) return memory[cacheKey];
            if (!database) return null;
            return new Promise(function (resolve) {
                var done = false;
                var timer = setTimeout(function () { complete(null); }, 2000);
                function complete(value) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    // A write made while the read was pending is authoritative.
                    resolve(Object.prototype.hasOwnProperty.call(memory, cacheKey) ? memory[cacheKey] : value);
                }
                try {
                    var transaction = database.transaction(store, "readonly");
                    var request = transaction.objectStore(store).get(key);
                    request.onsuccess = function () { complete(request.result ? request.result.value : null); };
                    request.onerror = transaction.onabort = function () { complete(null); };
                } catch (_) { complete(null); }
            });
        });
    }
    function set(store, key, value) {
        memory[store + ":" + key] = value;
        return init().then(function () {
            if (!database) return;
            try {
                var target = database.transaction(store, "readwrite").objectStore(store);
                var record = { key: key, value: value, ts: Date.now() };
                // Existing installations used `k` for prefs and `id` for cart.
                if (typeof target.keyPath === "string" && target.keyPath) record[target.keyPath] = key;
                if (target.keyPath == null) target.put(record, key);
                else target.put(record);
            } catch (_) { /* The in-memory value remains available. */ }
        });
    }
    return {
        init: init, get: get, set: set,
        getCart: function () { return get("cart", "current").then(function (value) { return Array.isArray(value) ? value : []; }); },
        setCart: function (items) { return set("cart", "current", items); },
        getPref: function (key) { return get("prefs", key); },
        setPref: function (key, value) { return set("prefs", key, value); }
    };
}

function createOutbox(storage, canSend, send) {
    var changes = Promise.resolve(), active = null;
    function change(operation) {
        changes = changes.then(function () { return storage.getPref("offline_queue"); }).then(function (queue) {
            return storage.setPref("offline_queue", operation(Array.isArray(queue) ? queue : []));
        });
        return changes;
    }
    return {
        enqueue: function (text) {
            return change(function (queue) {
                return queue.concat({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), text: text, ts: Date.now() });
            });
        },
        drain: function () {
            if (active) return active;
            active = (async function () {
                while (canSend()) {
                    await changes;
                    var queue = await storage.getPref("offline_queue");
                    if (!Array.isArray(queue) || !queue.length || !canSend()) return;
                    var item = queue[0];
                    if (!item || typeof item.text !== "string" || !item.text.trim()) {
                        await change(function (current) { return current.slice(1); });
                        continue;
                    }
                    if (await send(item.text) !== true) return;
                    await change(function (current) { return current.slice(1); });
                }
            })().finally(function () { active = null; });
            return active;
        }
    };
}

module.exports = { createSessionStore: createSessionStore, createOutbox: createOutbox };
