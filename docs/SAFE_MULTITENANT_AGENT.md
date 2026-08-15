# INDICATOR: Safe per-site agent foundation

Each installed widget is a **site assistant**, not a copy of one shared brain.
The Agent receives the current page's visible Site DNA and resolves a separate
site profile before answering.  A profile defines its identity, public
knowledge, permitted actions, and browser origins.

## What is implemented now

- `data/site-profiles.json` is the local development registry.
- `services/siteProfiles.js` resolves the public site profile without exposing
  its lookup key to the agent response.
- Unknown websites still get a temporary identity inferred from their visible
  page, but receive no other tenant's registered knowledge.
- A registered tenant is isolated: its profile knowledge replaces the demo
  knowledge unless it explicitly opts into the local demo dataset.
- The widget now supports `data-site-key` / `window.IndicatorConfig.siteKey`.
  This is a public site identifier, not a password or an admin key.
- Cross-page navigation remains same-origin only, and sensitive actions remain
  blocked or require confirmation.

## Safe installation shape

Place only the public widget code on the customer's website:

```html
<script
  src="https://agent.example/supreme-boost/boost.js"
  data-site-key="public_site_identifier"
  data-backend-url="https://agent.example/api/chat"
  defer>
</script>
```

Never put an admin token, database password, Shopify secret, payment key, or
write-capable API key in this snippet.  Every visitor can read browser source.

For a production deployment, configure both layers of origin protection:

```powershell
$env:INDICATOR_STRICT_SITE_ORIGIN = "true"
$env:ENFORCE_STRICT_CORS = "true"
$env:CORS_ALLOWED_ORIGINS = "https://client.example"
```

Also register the exact origin in that site's `allowedOrigins`.  A copied
public site key from another domain is then rejected by `/api/chat`.

## How backend learning must work

The browser plugin may read only data visible on the page.  To use stock,
orders, CRM, or CMS data, create a server-to-server connector for the
particular platform (Shopify, WooCommerce, WordPress, etc.).  The connector
should use OAuth or a secret stored only in INDICATOR's protected backend and
should expose an allowlist of read-only operations first.

The sync process should validate incoming records, build a per-tenant search
index, record the source and sync timestamp, and never modify customer data
without an explicit confirmation flow.  Do not let ordinary customer chats
rewrite the profile, role, permissions, or knowledge automatically.

## Optional external research

For a question the website cannot answer (for example, an independent product
review), `api/chat` can call a deployment-owned research gateway only when both
variables are set:

```powershell
$env:INDICATOR_RESEARCH_URL = "https://your-research-gateway.example/search"
$env:INDICATOR_RESEARCH_API_KEY = "server-side-secret"
```

The gateway must accept a small safe-search query and return up to three
`{ title, snippet, url }` records.  It is disabled by default.  Do not put the
key in the widget, do not use a search result to perform an action, and present
the source URLs with any externally researched response.

## Production next steps

`data/site-profiles.json` is intentionally a local demo registry.  Before
onboarding external customers, move profiles and knowledge to a tenant-scoped
database, replace legacy browser API keys with public site keys plus a signed
server-side enrollment flow, and add audit logs for every connector request.
