# INDICATOR AI Architecture

## Overview
The new INDICATOR AI Architecture transitions from a highly coupled, direct-to-provider flow into a robust, model-agnostic orchestration pipeline. This ensures maximum stability, prevents vendor lock-in, and introduces a dynamic routing layer that optimizes performance and cost.

## Request Flow
1. **User Input (`api/chat.js`)**: The request comes from the frontend via the widget. `api/chat.js` acts as the controller, pulling memory context, RAG knowledge, and generating a unique `requestId`.
2. **Deterministic Agent (`indicatorAgent.js`)**: First, the local, deterministic agent tries to fulfill the request. If it matches a strict product query or a simple site navigation action, it generates the response immediately without hitting an LLM.
3. **AI Gateway (`services/ai/gateway.js`)**: If the deterministic agent defers the request, it goes to the AI Gateway.
4. **Context Builder (`services/ai/contextBuilder.js`)**: The Gateway sends raw inputs to the Context Builder which enforces token limits and meticulously constructs a structured context (System prompts, Memory, RAG, Tools, and User Query).
5. **Model Router (`services/ai/router.js`)**: The Model Router selects configured providers and provider-specific models. It orchestrates the HTTP call with:
   - Timeout handlers
   - Exponential Backoff Retries
   - Fallback routing
   - Circuit Breakers
6. **Provider Execution (`services/ai/providers/*.js`)**: The active provider (e.g., Gemini, OpenAI, Groq, or Local AI) handles the specific API format for that model and returns a raw response.
7. **Response Validator (`services/ai/responseValidator.js`)**: The raw response is strictly validated against the `RESPONSE_SCHEMA`. If invalid, the Gateway triggers an auto-correction prompt.
8. **Frontend Delivery**: The structured JSON is sent back to the client UI.

## Model Routing & Providers
The system uses `services/ai/router.js` to dispatch calls.
Providers are abstracted in `services/ai/providers/`.
To add a new provider:
1. Create a class extending `BaseProvider` in `services/ai/providers/<name>.js`.
2. Implement the `generate(payload, options)` method to return a raw string.
3. Register it in the `ModelRouter` constructor inside `router.js`.

### Environment Variables
Configure your AI routing in `.env`:
```env
AI_PRIMARY_PROVIDER=gemini
AI_FALLBACK_PROVIDER=groq

OPENAI_MODEL=gpt-5.6-terra
GEMINI_MODEL=gemini-2.5-flash
GROQ_MODEL=llama-3.3-70b-versatile
AI_NORMAL_MODEL=gemini-2.5-flash
AI_FALLBACK_MODEL=llama-3.3-70b-versatile

AI_REQUEST_TIMEOUT_MS=15000
AI_MAX_RETRIES=2
AI_CIRCUIT_MAX_FAILURES=3

OPENAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
LOCAL_AI_BASE_URL=
LOCAL_AI_MODEL=
```

## Local Model Support
The system fully supports `LOCAL_AI_BASE_URL` assuming an OpenAI-compatible interface (like vLLM, Ollama, or LM Studio). Set `AI_PRIMARY_PROVIDER=local` to route everything to your local inference server.

## Memory Manager
`services/memory/index.js` governs memory. It uses an adapter pattern (currently `inMemoryStore.js`).
Memory is split logically but merged before entering the LLM to provide immediate context without blowing the token budget.

## RAG Enhancement
The RAG pipeline (`services/rag.js`) combines:
- **Vector Similarity Search** (via Supabase embeddings)
- **Text/Keyword Search** (hybrid approach)
Results are merged, deduplicated, and passed through a deterministic scoring function (`scoreChunk`) before the top 5 are injected into the Context Builder.

## Tools
Defined in `services/tools/registry.js`, the AI receives the `name`, `description`, and `parameters` of available tools (e.g., `warp_to_page`, `find_product`). The model calls them by setting the `action` field in its output JSON.

## Debugging
Every generation uses a `requestId` tracked via `services/ai/logger.js`.
Ensure `NODE_ENV=development` to see full trace logs in the terminal.
Secret API keys and sensitive PII are scrubbed by the logger.
