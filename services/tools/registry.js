'use strict';

const MAX_ARGUMENT_BYTES = 16000;
const MAX_RESULT_BYTES = 32000;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = (code, message) => ({ success: false, status: 'error', error: { code, message } });

function validate(value, schema, path = 'arguments', depth = 0) {
    if (depth > 12) return `${path} is too deeply nested`;
    if (!schema || !schema.type) return `${path} has no supported schema`;
    if (schema.type === 'object') {
        if (!object(value)) return `${path} must be an object`;
        const properties = schema.properties || {};
        for (const key of schema.required || []) {
            if (!Object.prototype.hasOwnProperty.call(value, key)) return `${path}.${key} is required`;
        }
        for (const key of Object.keys(value)) {
            if (DANGEROUS_KEYS.has(key) || !Object.prototype.hasOwnProperty.call(properties, key)) return `${path} has an unsupported field`;
            const error = validate(value[key], properties[key], `${path}.${key}`, depth + 1);
            if (error) return error;
        }
    } else if (schema.type === 'array') {
        if (!Array.isArray(value)) return `${path} must be an array`;
        if (value.length < (schema.minItems || 0) || value.length > (schema.maxItems ?? 100)) return `${path} has an invalid number of items`;
        for (let index = 0; index < value.length; index++) {
            const error = validate(value[index], schema.items, `${path}[${index}]`, depth + 1);
            if (error) return error;
        }
    } else if (schema.type === 'string') {
        if (typeof value !== 'string') return `${path} must be a string`;
        if (value.trim().length < (schema.minLength || 0) || value.length > (schema.maxLength ?? 4000)) return `${path} has an invalid length`;
    } else if (schema.type === 'number' || schema.type === 'integer') {
        if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) return `${path} must be a finite ${schema.type}`;
        if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) return `${path} is outside its allowed range`;
    } else if (schema.type === 'boolean') {
        if (typeof value !== 'boolean') return `${path} must be a boolean`;
    } else return `${path} has an unsupported schema type`;
    if (schema.enum && !schema.enum.includes(value)) return `${path} is not an allowed value`;
    return null;
}

class ToolRegistry {
    constructor() { this.tools = new Map(); }

    register(tool) {
        if (!tool || !/^[a-z][a-z0-9_]{0,63}$/.test(tool.name || '') || typeof tool.execute !== 'function' ||
            typeof tool.description !== 'string' || tool.parameters?.type !== 'object') {
            throw new Error('Invalid tool definition');
        }
        if (this.tools.has(tool.name)) throw new Error(`Tool ${tool.name} is already registered`);
        this.tools.set(tool.name, { ...tool, parameters: JSON.parse(JSON.stringify(tool.parameters)) });
        return this;
    }

    getAvailableTools(context = {}) {
        return Array.from(this.tools.values())
            .filter(tool => !Array.isArray(context.allowedTools) || context.allowedTools.includes(tool.name))
            .map(tool => ({ name: tool.name, description: tool.description, parameters: JSON.parse(JSON.stringify(tool.parameters)) }));
    }

    async execute(name, params, context = {}) {
        const tool = this.tools.get(name);
        if (!tool) return failure('UNKNOWN_TOOL', 'The requested tool is not available');
        if (Array.isArray(context.allowedTools) && !context.allowedTools.includes(name)) return failure('TOOL_NOT_ALLOWED', 'This tool is not available for this request');
        if (context.tenantId && context.payload?.tenantId && context.tenantId !== context.payload.tenantId) {
            return failure('TENANT_MISMATCH', 'Tool context does not match the current tenant');
        }
        let args;
        try {
            const serialized = typeof params === 'string' ? params : JSON.stringify(params);
            if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_ARGUMENT_BYTES) return failure('INVALID_ARGUMENTS', 'Tool arguments are missing or too large');
            args = JSON.parse(serialized);
        } catch (_) { return failure('INVALID_ARGUMENTS', 'Tool arguments must be valid JSON'); }
        const argumentError = validate(args, tool.parameters);
        if (argumentError) return failure('INVALID_ARGUMENTS', argumentError);

        const remaining = Number.isFinite(context.deadlineAt) ? context.deadlineAt - Date.now() : 5000;
        const timeoutMs = Math.min(5000, Math.max(1, Number(context.timeoutMs) || 3000), remaining);
        if (remaining <= 0 || context.signal?.aborted) return failure('TOOL_TIMEOUT', 'Tool execution deadline has expired');
        const controller = new AbortController();
        let timer;
        let onAbort;
        try {
            const cancelled = new Promise(resolve => {
                onAbort = () => { controller.abort(); resolve(failure('TOOL_TIMEOUT', 'Tool execution was cancelled or timed out')); };
                context.signal?.addEventListener('abort', onAbort, { once: true });
                timer = setTimeout(onAbort, timeoutMs);
            });
            const result = await Promise.race([
                Promise.resolve().then(() => controller.signal.aborted
                    ? failure('TOOL_TIMEOUT', 'Tool execution was cancelled')
                    : tool.execute(args, { ...context, signal: controller.signal })),
                cancelled
            ]);
            if (!object(result) || typeof result.success !== 'boolean' || !['completed', 'pending', 'error'].includes(result.status)) {
                return failure('INVALID_TOOL_RESULT', 'The tool did not return a supported result');
            }
            const serialized = JSON.stringify(result);
            if (Buffer.byteLength(serialized, 'utf8') > MAX_RESULT_BYTES) return failure('RESULT_TOO_LARGE', 'The result is too large; narrow the request');
            return JSON.parse(serialized);
        } catch (_) {
            // Handler exception details may contain credentials or private backend data.
            return failure('TOOL_FAILED', 'The tool could not complete this request');
        } finally {
            clearTimeout(timer);
            context.signal?.removeEventListener('abort', onAbort);
        }
    }
}

module.exports = new ToolRegistry();
module.exports.ToolRegistry = ToolRegistry;
module.exports.failure = failure;
