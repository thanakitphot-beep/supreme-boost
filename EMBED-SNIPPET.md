# INDICATOR Widget Embed

Generate the tenant-specific snippet in the customer or admin dashboard. A
minimal installation has this form:

```html
<script src="https://indicator-web-chat.onrender.com/supreme-boost/boost.js"
        data-api-key="TENANT_API_KEY"
        data-backend-url="https://indicator-web-chat.onrender.com/api/chat"
        data-lang="auto"
        data-title="Customer Support"
        data-primary="#2563eb"
        data-position="right"
        defer>
</script>
```

Before installing it, register the website's exact HTTPS origin in the tenant's
`allowed_origins`. Do not use a test key, wildcard origin, or another tenant's
key. `data-shop-prompt` is optional context and is never a substitute for
server-owned tenant knowledge.

Render Free may cold-start after inactivity. This preview does not provide an
uptime SLA.
