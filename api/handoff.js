'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { connectToDatabase } = require('./_mongodb');
const { maskPII } = require('../services/safety');
const { checkRateLimit } = require('../services/rateLimit');
const { applyPluginCors, authorizePluginRequest } = require('../services/tenantAccess');
const { consumeUsage, entitlementsFor } = require('../services/plans');

function cleanText(value, max) {
    return maskPII(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, max);
}

function safeContact(settings = {}) {
    const contact = {};
    const email = cleanText(settings.support_email, 200);
    const phone = cleanText(settings.support_phone, 40);
    const url = cleanText(settings.support_url, 500);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) contact.email = email;
    if (/^[+\d][\d\s()-]{5,30}$/u.test(phone)) contact.phone = phone;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:') contact.url = parsed.href;
    } catch (_) { }
    return contact;
}

async function notifySupport(ticket) {
    if (!ticket.contact.email || !process.env.SMTP_USER || !process.env.SMTP_PASS) return 'queued';
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
        secure: String(process.env.SMTP_PORT) === '465',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: ticket.contact.email,
            subject: `[INDICATOR] Human handoff ${ticket.priority === 'high' ? 'high priority' : 'request'}: ${ticket.id}`,
            text: [
                `Ticket: ${ticket.id}`,
                `Priority: ${ticket.priority}`,
                `Page: ${ticket.page.title || ticket.page.url || 'Unknown'}`,
                `Reason: ${ticket.reason || 'Visitor requested support'}`,
                `Summary: ${ticket.summary || '-'}`
            ].join('\n')
        });
        return 'delivered';
    } catch (_) {
        return 'queued';
    }
}

module.exports = async function handoffHandler(req, res) {
    if (!await applyPluginCors(req, res)) return res.status(403).json({ error: 'Origin is not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!req._rateLimitChecked && !await checkRateLimit(req, res, 'api')) return;

    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const access = await authorizePluginRequest({ apiKey: body.apiKey, origin: req.headers.origin });
    if (access.error) return res.status(403).json({ error: access.error });
    if (!access.tenant || access.tenant.id === 'demo') {
        return res.status(200).json({ status: 'unavailable', message: 'หน้านี้เป็นตัวอย่าง จึงยังไม่มีเจ้าหน้าที่สำหรับรับเรื่อง' });
    }
    const entitlements = access.tenant.entitlements || entitlementsFor(access.tenant);
    if (!entitlements.features.handoff) return res.status(403).json({ error: 'This plan does not include human handoff' });
    if (!await checkRateLimit(req, res, 'api', { principal: `tenant:${access.tenant.id}`, limit: entitlements.chatPerMinute })) return;

    const db = await connectToDatabase();
    if (!db) return res.status(503).json({ error: 'Support queue is temporarily unavailable' });

    const tenantId = access.tenant.id;
    const idempotencyKey = cleanText(body.idempotencyKey, 120) || crypto.randomUUID();
    const settings = await db.collection('settings').findOne({ id: tenantId }) || {};
    const contact = safeContact(settings);
    const now = new Date().toISOString();
    const priority = body.priority === 'high' ? 'high' : 'normal';
    const ticket = {
        id: `handoff_${crypto.randomUUID()}`,
        tenant_id: tenantId,
        idempotency_key: idempotencyKey,
        status: 'reserving',
        priority,
        reason: cleanText(body.reason, 500),
        summary: cleanText(body.summary, 1600),
        conversation: Array.isArray(body.history) ? body.history.slice(-8).map(item => ({
            role: item && item.role === 'assistant' ? 'assistant' : 'user',
            text: cleanText(item && item.text, 600)
        })).filter(item => item.text) : [],
        page: { url: cleanText(body.url, 500), title: cleanText(body.title, 200) },
        contact,
        created_at: now,
        updated_at: now
    };
    try {
        await db.collection('handoff_tickets').insertOne(ticket);
    } catch (error) {
        if (!error || error.code !== 11000) throw error;
        const existing = await db.collection('handoff_tickets').findOne({ tenant_id: tenantId, idempotency_key: idempotencyKey });
        if (existing && existing.status === 'quota_rejected') return res.status(429).json({ error: 'Monthly handoff quota reached' });
        return res.status(existing && existing.status === 'reserving' ? 202 : 200).json({ status: existing && existing.status || 'queued', ticketId: existing && existing.id, contact: existing && existing.contact || {}, message: 'คำขอเดิมกำลังดำเนินการหรืออยู่ในคิวแล้ว' });
    }
    const usage = await consumeUsage(access.tenant, 'handoff');
    if (!usage.allowed) {
        await db.collection('handoff_tickets').updateOne({ id: ticket.id }, { $set: { status: 'quota_rejected', updated_at: new Date().toISOString() } });
        return res.status(usage.status || 429).json({ error: usage.reason });
    }
    ticket.status = 'queued';
    await db.collection('handoff_tickets').updateOne({ id: ticket.id }, { $set: { status: 'queued', updated_at: new Date().toISOString() } });
    ticket.status = await notifySupport(ticket);
    if (ticket.status !== 'queued') {
        await db.collection('handoff_tickets').updateOne({ id: ticket.id }, { $set: { status: ticket.status, updated_at: new Date().toISOString() } });
    }
    await db.collection('logs').insertOne({
        id: crypto.randomUUID(),
        type: 'handoff',
        message: `Human handoff requested: ${ticket.reason || 'Visitor requested support'}`,
        metadata: { tenantId, ticketId: ticket.id, priority, delivery: ticket.status },
        timestamp: now
    });
    return res.status(201).json({
        status: ticket.status,
        ticketId: ticket.id,
        contact,
        message: ticket.status === 'delivered' ? 'คำขอถูกส่งถึงช่องทางเจ้าหน้าที่แล้ว' : 'คำขอถูกส่งเข้าคิวเจ้าหน้าที่แล้ว'
    });
};
