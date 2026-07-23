-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create the knowledge_chunks table
create table if not exists public.knowledge_chunks (
    id uuid default gen_random_uuid() primary key,
    tenant_id text not null,
    url text,
    title text,
    content text,
    embedding vector(768),
    chunk_index integer,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index for vector similarity search
create index if not exists knowledge_chunks_embedding_idx 
on public.knowledge_chunks 
using hnsw (embedding vector_cosine_ops);

-- Create a helper function for cosine similarity search (to be called via rpc from supabase-js)
create or replace function match_knowledge_chunks (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_tenant_id text
)
returns table (
  id uuid,
  tenant_id text,
  url text,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    id,
    tenant_id,
    url,
    title,
    content,
    1 - (knowledge_chunks.embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where tenant_id = filter_tenant_id
    and 1 - (knowledge_chunks.embedding <=> query_embedding) > match_threshold
  order by knowledge_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- Create tenants table if not exists
create table if not exists public.tenants (
    id uuid default gen_random_uuid() primary key,
    company_name text not null,
    api_key text not null unique,
    status text default 'active',
    package_type text default 'basic',
    expires_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create billing_requests table
create table if not exists public.billing_requests (
    id uuid default gen_random_uuid() primary key,
    tenant_name text not null,
    contact_email text,
    package_type text not null,
    amount numeric(10,2),
    slip_base64 text,
    status text default 'pending', -- pending, approved, rejected
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create payment_methods table (Bank accounts / PromptPay)
create table if not exists public.payment_methods (
    id uuid default gen_random_uuid() primary key,
    bank_name text not null,
    account_number text not null,
    account_name text not null,
    qr_base64 text,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create settings table
create table if not exists public.settings (
    id text primary key,
    system_model text,
    system_prompt text,
    theme_color text,
    temperature float,
    pricing_starter numeric(10,2) default 990,
    pricing_pro numeric(10,2) default 2490,
    payment_mode text default 'manual', -- manual, slipok, stripe
    stripe_secret_key text,
    slipok_api_key text,
    slipok_branch_id text,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create logs table
create table if not exists public.logs (
    id uuid default gen_random_uuid() primary key,
    timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
    type text,
    message text,
    metadata jsonb
);

-- Create profiles table for RBAC (Role-Based Access Control)
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    role text default 'customer' check (role in ('admin', 'customer')),
    tenant_id uuid references public.tenants(id) on delete set null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==============================================================================
-- OMEGA-JARVIS v3.0.0 UPGRADES
-- ==============================================================================

-- 1. Memory entries (Long-Term Memory)
create table if not exists public.memory_entries (
  id uuid default gen_random_uuid() primary key,
  tenant_id text not null,
  user_id text,
  content text,
  embedding vector(768),
  importance float default 0.5,
  tags jsonb,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists memory_entries_embedding_idx 
on public.memory_entries 
using hnsw (embedding vector_cosine_ops);

create or replace function match_memory_entries (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_tenant_id text
)
returns table (
  id uuid,
  tenant_id text,
  user_id text,
  content text,
  importance float,
  tags jsonb,
  similarity float
)
language sql stable
as $$
  select
    id,
    tenant_id,
    user_id,
    content,
    importance,
    tags,
    1 - (memory_entries.embedding <=> query_embedding) as similarity
  from memory_entries
  where tenant_id = filter_tenant_id
    and (expires_at is null or expires_at > now())
    and 1 - (memory_entries.embedding <=> query_embedding) > match_threshold
  order by memory_entries.embedding <=> query_embedding
  limit match_count;
$$;

-- 2. Plugins
create table if not exists public.plugins (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  version text default '1.0.0',
  code text,
  permissions jsonb default '{}',
  enabled boolean default true,
  tenant_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Feature Flags
create table if not exists public.feature_flags (
  id uuid default gen_random_uuid() primary key,
  flag_name text not null unique,
  enabled boolean default false,
  tenant_id text,
  rollout_percent integer default 0
);

-- 4. Agent Traces (Observability)
create table if not exists public.agent_traces (
  id uuid default gen_random_uuid() primary key,
  request_id text not null,
  tenant_id text,
  agent_name text,
  input jsonb,
  output jsonb,
  duration_ms integer,
  tokens_used integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
