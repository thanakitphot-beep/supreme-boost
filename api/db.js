const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("Supabase credentials not found in environment variables.");
}

const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_KEY || 'placeholder-key',
    {
        auth: { persistSession: false },
        db: { schema: 'public' }
    }
);

module.exports = {

    // ─── Tenants ────────────────────────────────────────────────
    getTenants: async () => {
        const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { console.error('getTenants error:', error); return []; }
        return data || [];
    },

    getTenantByApiKey: async (apiKey) => {
        const { data, error } = await supabase
            .from('tenants')
            .select('*')
            .eq('api_key', apiKey)
            .limit(1)
            .maybeSingle();
        if (error) { console.error('getTenantByApiKey error:', error); return null; }
        return data || null;
    },

    addTenant: async (tenant) => {
        const { data, error } = await supabase
            .from('tenants')
            .insert({
                id: tenant.id,
                company_name: tenant.companyName,
                api_key: tenant.apiKey,
                status: tenant.status || 'active',
                package_type: tenant.packageType || 'basic',
                expires_at: tenant.expiresAt
            })
            .select()
            .single();
        if (error) { console.error('addTenant error:', error); return null; }
        return data;
    },

    updateTenant: async (id, updates) => {
        const payload = {};
        if (updates.companyName !== undefined) payload.company_name = updates.companyName;
        if (updates.apiKey !== undefined) payload.api_key = updates.apiKey;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.packageType !== undefined) payload.package_type = updates.packageType;
        if (updates.expiresAt !== undefined) payload.expires_at = updates.expiresAt;

        const { data, error } = await supabase
            .from('tenants')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) { console.error('updateTenant error:', error); return null; }
        return data;
    },

    deleteTenant: async (id) => {
        const { error } = await supabase
            .from('tenants')
            .delete()
            .eq('id', id);
        if (error) { console.error('deleteTenant error:', error); return false; }
        return true;
    },

    // ─── Knowledge Base ─────────────────────────────────────────
    addKnowledge: async (chunk) => {
        const { data, error } = await supabase
            .from('knowledge_chunks')
            .insert({
                tenant_id: chunk.tenantId,
                url: chunk.url,
                title: chunk.title,
                content: chunk.content,
                embedding: chunk.embedding,
                chunk_index: chunk.chunkIndex
            })
            .select()
            .single();
        if (error) { console.error('addKnowledge error:', error); return null; }
        return data;
    },

    getKnowledge: async (tenantId) => {
        const { data, error } = await supabase
            .from('knowledge_chunks')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });
        if (error) { console.error('getKnowledge error:', error); return []; }
        return data || [];
    },

    deleteKnowledge: async (id) => {
        const { error } = await supabase
            .from('knowledge_chunks')
            .delete()
            .eq('id', id);
        if (error) { console.error('deleteKnowledge error:', error); return false; }
        return true;
    },

    deleteKnowledgeByUrl: async (tenantId, url) => {
        const { error } = await supabase
            .from('knowledge_chunks')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('url', url);
        if (error) { console.error('deleteKnowledgeByUrl error:', error); return false; }
        return true;
    },

    searchKnowledge: async (tenantId, queryEmbedding, limit = 5, matchThreshold = 0.5) => {
        const { data, error } = await supabase.rpc('match_knowledge_chunks', {
            query_embedding: queryEmbedding,
            match_threshold: matchThreshold,
            match_count: limit,
            filter_tenant_id: tenantId
        });
        if (error) { console.error('searchKnowledge error:', error); return []; }
        return data || [];
    },


    // ─── Settings ───────────────────────────────────────────────
    getSettings: async () => {
        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('id', 'global')
            .maybeSingle();
        if (error || !data) return null;
        return {
            systemModel: data.system_model,
            systemPrompt: data.system_prompt,
            themeColor: data.theme_color,
            temperature: data.temperature
        };
    },

    saveSettings: async (settings) => {
        const payload = {};
        if (settings.systemModel !== undefined) payload.system_model = settings.systemModel;
        if (settings.systemPrompt !== undefined) payload.system_prompt = settings.systemPrompt;
        if (settings.themeColor !== undefined) payload.theme_color = settings.themeColor;
        if (settings.temperature !== undefined) payload.temperature = settings.temperature;
        payload.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('settings')
            .upsert({ id: 'global', ...payload })
            .select()
            .single();
        if (error) { console.error('saveSettings error:', error); return null; }
        return data;
    },

    // ─── Logs ───────────────────────────────────────────────────
    addLog: async (type, message, metadata = {}) => {
        const { error } = await supabase
            .from('logs')
            .insert({
                type: type,
                message: String(message).slice(0, 2000),
                metadata: metadata
            });
        if (error) console.error('addLog error:', error);
    },

    getLogs: async (limit = 100) => {
        const { data, error } = await supabase
            .from('logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);
        if (error) { console.error('getLogs error:', error); return []; }
        return (data || []).reverse();
    }

};
