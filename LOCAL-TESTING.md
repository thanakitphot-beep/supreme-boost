# Local Testing

Install dependencies, run all repository gates, then start the server:

```bash
npm ci
npm run ci
npm start
```

Open `http://localhost:3000`. For an embed test on another local page, create a
development tenant with that page's exact origin and use:

```html
<script src="http://localhost:3000/supreme-boost/boost.js"
        data-api-key="DEVELOPMENT_TENANT_API_KEY"
        data-backend-url="http://localhost:3000/api/chat"
        defer>
</script>
```

Production requires HTTPS, an exact tenant origin, MongoDB indexes, dependency
preflight, and the release checks in `docs/PRODUCTION_READINESS.md`.
