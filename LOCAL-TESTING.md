## 🚀 How to Test Your Widget Locally (แทดสอบ Widget ในเครื่องของคุณ)

### Start the Development Server

```bash
npm start
```

Your server will run at: **http://localhost:3000**

---

### Test the Widget

1. **Open this page in your browser:**
   ```
   http://localhost:3000/test-widget-locally.html
   ```

2. **You should see:**
   - Page with purple gradient background
   - Instructions and status messages
   - Blue "AI" button in bottom-right corner (after a few seconds)

3. **Try clicking the AI button and asking:**
   - "มีสินค้าอะไรบ้าง" (What products?)
   - "ราคาเท่าไหร่" (How much?)
   - ขยายตัวอักษร (Enlarge text)

---

### Troubleshooting

**❌ Widget not showing?**

1. Press F12 to open Developer Console
2. Look for messages starting with `[INDICATOR WEB CHAT]`
3. Check for any red errors
4. Make sure server is running: `npm start`
5. Try refreshing the page: Ctrl+R
6. Check your terminal for server errors

**✅ Common Success Messages:**
- `[INDICATOR WEB CHAT] ✓ Initializing INDICATOR WEB CHAT Widget...`
- `[INDICATOR WEB CHAT] ✓ Widget initialized successfully`

---

### Next Steps

Once it works locally, see **EMBED-SNIPPET.md** to:
- Deploy to Vercel
- Get your production domain
- Add widget to your website

---

## 📱 Testing on Different Websites

You can also test the embed code on any website:

```html
<script src="http://localhost:3000/supreme-boost/boost.js"
        data-shop-prompt="ร้านทดสอบ"
        async>
</script>
```

Just add this before the closing `</body>` tag of any HTML file.

---

## 🌐 For Production / ใช้จริง

Replace the localhost URL with your Vercel domain:

```html
<script src="https://your-domain.vercel.app/supreme-boost/boost.js"
        data-shop-prompt="Your Shop Name"
        async>
</script>
```

See **SETUP.md** for Vercel deployment instructions.
