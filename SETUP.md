# INDICATOR WEB CHAT Setup Guide

## Quick Start (5 minutes)

### 1. Clone the Repository
```bash
git clone https://github.com/thanakitphot-beep/supreme-boost.git
cd supreme-boost
```

### 2. Set Up Environment Variables
Create a `.env` file in the project root:
```
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Get your API key from: https://ai.google.dev/

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

## Deploy to Vercel (Production)

### Prerequisites
- Vercel account (free at https://vercel.com)
- GitHub account with the cloned/forked repository

### Steps

1. **Connect to Vercel**
   - Go to https://vercel.com
   - Click "New Project"
   - Import your GitHub repository

2. **Set Environment Variables**
   - In Vercel dashboard, go to Settings > Environment Variables
   - Add:
     - Name: `GEMINI_API_KEY`
     - Value: `your_actual_gemini_api_key`

3. **Deploy**
   - Vercel will automatically deploy when you push to GitHub
   - Note your deployment URL (e.g., `supreme-boost-prod.vercel.app`)

4. **Embed on Your Website**
   - Use this code on any website:
   ```html
   <script src="https://supreme-boost-prod.vercel.app/supreme-boost/boost.js"
           data-shop-prompt="Your shop name and info"
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
- Check that GEMINI_API_KEY is set on Vercel

### AI doesn't respond
- Verify GEMINI_API_KEY is valid
- Check Vercel logs for API errors
- Widget will fallback to page content if API fails

### CORS errors
- This shouldn't happen as CORS is enabled in vercel.json
- If it does, check that your domain is using HTTPS

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
├── plugins/
│   ├── chat.js              # Chat widget component
│   ├── darkmode.js          # Dark mode toggle
│   └── manager.js           # Plugin manager
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
Edit `api/chat.js` → `buildSystemPrompt()` function

### Change widget appearance
Edit `supreme-boost/boost.js` → `injectStyle()` function and CSS variables

### Add more languages
Edit the `I18N` object in `supreme-boost/boost.js`

---

## License & Attribution

This project uses:
- Google Gemini API for AI
- Vercel for hosting
- Vanilla JavaScript (no dependencies)

Created for INDICATOR Shop AI assistant integration.
