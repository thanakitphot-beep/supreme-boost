-- =====================================================
-- INDICATOR AI Chat Widget — Full Database Setup
-- =====================================================
-- วิธีใช้: เปิด Supabase Dashboard → SQL Editor → วางโค้ดทั้งหมด → กด Run
-- =====================================================

-- ─── 1. TABLE: tenants ───────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name text NOT NULL,
    username text,
    password text,
    api_key text UNIQUE NOT NULL DEFAULT ('sk_live_' || encode(gen_random_bytes(12), 'hex')),
    package_type text DEFAULT 'basic',
    status text DEFAULT 'active',
    expires_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ─── 2. TABLE: billing_requests ──────────────────────
CREATE TABLE IF NOT EXISTS billing_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_name text NOT NULL,
    contact_email text,
    package_type text,
    amount numeric DEFAULT 0,
    slip_base64 text,
    status text DEFAULT 'pending',
    created_at timestamptz DEFAULT now()
);

-- ─── 3. TABLE: payment_methods ───────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name text NOT NULL,
    account_number text NOT NULL,
    account_name text NOT NULL,
    qr_base64 text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- ─── 4. TABLE: settings ──────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    id text PRIMARY KEY,
    payment_mode text DEFAULT 'manual',
    stripe_secret_key text DEFAULT '',
    slipok_api_key text DEFAULT '',
    slipok_branch_id text DEFAULT '',
    system_model text DEFAULT 'gemini-2.5-flash',
    system_prompt text DEFAULT '',
    temperature numeric DEFAULT 0.7,
    theme_color text DEFAULT '#7c3aed',
    updated_at timestamptz DEFAULT now()
);

-- ─── 5. TABLE: knowledge_chunks ──────────────────────
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    url text,
    title text,
    content text,
    created_at timestamptz DEFAULT now()
);

-- ─── 6. TABLE: logs ──────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text DEFAULT 'info',
    message text,
    metadata jsonb DEFAULT '{}',
    timestamp timestamptz DEFAULT now()
);

-- =====================================================
-- Row-Level Security (RLS) — เปิดและตั้ง Policy
-- =====================================================

-- tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_tenants" ON tenants;
CREATE POLICY "service_role_all_tenants" ON tenants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- billing_requests
ALTER TABLE billing_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_billing" ON billing_requests;
CREATE POLICY "service_role_all_billing" ON billing_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_insert_billing" ON billing_requests;
CREATE POLICY "anon_insert_billing" ON billing_requests
    FOR INSERT TO anon WITH CHECK (true);

-- payment_methods
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_payment" ON payment_methods;
CREATE POLICY "service_role_all_payment" ON payment_methods
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_read_active_payment" ON payment_methods;
CREATE POLICY "anon_read_active_payment" ON payment_methods
    FOR SELECT TO anon USING (is_active = true);

-- settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_settings" ON settings;
CREATE POLICY "service_role_all_settings" ON settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_read_settings" ON settings;
CREATE POLICY "anon_read_settings" ON settings
    FOR SELECT TO anon USING (true);

-- knowledge_chunks
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_knowledge" ON knowledge_chunks;
CREATE POLICY "service_role_all_knowledge" ON knowledge_chunks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- logs
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_logs" ON logs;
CREATE POLICY "service_role_all_logs" ON logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- Insert default settings row
-- =====================================================
INSERT INTO settings (id, payment_mode)
VALUES ('global', 'manual')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Done! รีเฟรชหน้า Admin แล้วลองใช้งานใหม่ได้เลย
-- =====================================================
