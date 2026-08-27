# INDICATOR WEB CHAT Setup Guide

## Quick Start (5 minutes)

### 1. Clone the Repository
```bash
git clone https://github.com/thanakitphot-beep/supreme-boost.git
cd supreme-boost
```

### 2. Configure INDICATOR knowledge
Edit `data/indicator-knowledge.json` with your permitted pages, products, FAQs, and glossary. The standard `owned` mode makes no request to Gemini or another model provider.

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Locally (Development)
```bash
npm run dev
```

Open the URL shown in terminal (usually `http://127.0.0.1:3000`)

### 5. Test the Widget
- You should see the demo page with a INDICATOR WEB CHAT chat widget in the bottom-right
- Ask it questions about the products shown
- Try: "มีสินค้าอะไรบ้าง" or "What products do you have?"

---

## Production Deployment

### Prerequisites
- MongoDB replica set
- SMTP account
- Stripe and/or SlipOK server-side credentials
- HTTPS API domain and exact customer origins

### Steps

1. **Configure secrets**
   - Set every required value from `.env.example` in the platform secret manager.
   - Keep `REQUIRE_TENANT_API_KEY=true`, strict CORS enabled, and the public demo disabled.

2. **Migrate and verify dependencies**
   ```bash
   npm run db:indexes
   npm run preflight:dependencies
   ```

3. **Deploy**
   - Render uses `render.yaml`; Docker uses `docker-compose.yml`.
   - For Vercel, run the Mongo migration as a separate release step.

4. **Verify and embed**
   - Run `npm run preflight:live`, then use the tenant API key and registered origin:
   ```html
    <script src="https://supreme-boost-prod.vercel.app/supreme-boost/boost.js"
            data-api-key="TENANT_API_KEY"
            data-backend-url="https://YOUR-API-DOMAIN/api/chat"
            defer>
   </script>
   ```

---

## Embed Widget on Any Website

### Basic Usage
```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
        data-shop-prompt="ร้านนี้ชื่อ My Shop"
        defer>
</script>
```

### Advanced Usage
```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
        data-lang="auto"
        data-title="Customer Support"
        data-shop-prompt="ร้านนี้ชื่อ My Shop ขายเสื้อผ้า มีโปรส่งฟรี"
        data-primary="#2563eb"
        data-position="right"
        data-open="false"
        defer>
</script>
```

### Customization Options

| Option | Values | Description |
|--------|--------|-------------|
| `data-lang` | `auto`, `th`, `en`, `zh`, `ja` | Language (auto = detect from browser) |
| `data-title` | Any text | Widget title |
| `data-shop-prompt` | Any text | Shop info for AI context |
| `data-primary` | Hex/RGB color | Primary widget color |
| `data-position` | `left`, `right` | Widget position |
| `data-open` | `true`, `false` | Open widget on page load |
| `data-greeting` | Any text | Custom greeting message |

---

## Troubleshooting

### Widget doesn't appear
- Check browser console (F12) for errors
- Ensure the Vercel domain is correct
- Check that `data/indicator-knowledge.json` contains the expected pages and products

### AI doesn't respond
- Check Vercel logs for `INDICATOR Agent Mode: owned`
- Check Vercel logs for API errors
- Widget will fallback to page content if API fails

### CORS errors
- Set `ENFORCE_STRICT_CORS=true` and add the exact HTTPS website origin to
  `CORS_ALLOWED_ORIGINS`.
- Register that same origin in the tenant's `allowed_origins` before embedding
  the widget. A tenant API key copied to another website is rejected.

### Need help?
- Check the main README.md
- Review the example in embed-example.html
- Check Vercel deployment logs

---

## Project Structure

```
supreme-boost/
├── api/
│   └── chat.js              # Serverless API endpoint
├── supreme-boost/
│   └── boost.js             # Embed widget script
├── index.html               # Demo page
├── embed-example.html       # Embed example page
├── package.json             # Dependencies
├── vercel.json              # Vercel config
├── README.md                # Full documentation
└── SETUP.md                 # This file
```

---

## Development Tips

### Run syntax check
```bash
npm run check
```

### Modify AI behavior
Edit `services/indicatorAgent.js` for agent behavior and `data/indicator-knowledge.json` for approved business knowledge

### Change widget appearance
Edit `supreme-boost/boost.js` → `injectStyle()` function and CSS variables

### Add more languages
Edit the `I18N` object in `supreme-boost/boost.js`

---

## License & Attribution

This project uses:
- INDICATOR owned agent core for website reasoning and actions
- Vercel for hosting
- Vanilla JavaScript (no dependencies)

Created for INDICATOR Shop AI assistant integration.
