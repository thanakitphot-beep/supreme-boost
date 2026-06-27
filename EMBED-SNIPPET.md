# INDICATOR WEB CHAT Widget - Embed Code

> **Copy this code and paste it into your website's HTML to add INDICATOR WEB CHAT chat widget**
> **This widget works on ANY website, anywhere in the world!**

---

## ⚡ Quick Setup (Most Reliable)

```html
<script src="https://test-mu-cyan-21.vercel.app/supreme-boost/boost.js"
        data-shop-prompt="ร้านนี้ชื่อ My Shop"
        async>
</script>
```

**Replace `YOUR-VERCEL-DOMAIN` with your actual Vercel domain**

> **Pro tip:** Use `async` instead of `defer` for faster and more reliable loading!

---

## Full Featured Version

```html
<script src="https://test-mu-cyan-21.vercel.app/supreme-boost/boost.js"
        data-lang="auto"
        data-title="Customer AI Support"
        data-shop-prompt="ร้านนี้ชื่อ INDICATOR Shop ขายเสื้อผ้าวัยรุ่น มีโปรโมชันส่งฟรีเมื่อซื้อครบ 1000 บาท"
        data-primary="#2563eb"
        data-position="right"
        data-open="false"
        async>
</script>
```

---

## Configuration Guide

| Attribute | Example | Description |
|-----------|---------|-------------|
| `data-shop-prompt` | `"ร้านนี้ชื่อ..."` | **Required**: Shop info for AI context |
| `data-lang` | `"auto"` | Language: auto/th/en/zh/ja |
| `data-title` | `"Customer Support"` | Widget header title |
| `data-primary` | `"#2563eb"` | Primary color (any CSS color) |
| `data-position` | `"right"` | Position: left/right |
| `data-open` | `"false"` | Open on page load: true/false |
| `data-greeting` | `"Hi there!"` | Custom greeting message |
| `data-backend-url` | `"https://..."` | Custom API endpoint (optional) |

---

## 📍 Where to Paste This Code

The widget works **anywhere** - it doesn't matter where you put the script! Here are the best locations:

### Option 1: Before closing `</body>` (RECOMMENDED)
```html
<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
</head>
<body>
    <!-- Your website content here -->
    
    <!-- Add INDICATOR WEB CHAT Widget at the bottom -->
    <script src="https://test-mu-cyan-21.vercel.app/supreme-boost/boost.js"
            data-shop-prompt="ร้านนี้ชื่อ My Shop"
            async>
    </script>
</body>
</html>
```

### Option 2: In the `<head>` section
```html
<head>
    <title>My Website</title>
    <script src="https://test-mu-cyan-21.vercel.app/supreme-boost/boost.js"
            data-shop-prompt="ร้านนี้ชื่อ My Shop"
            async>
    </script>
</head>
```

### Option 3: With other scripts
You can paste it anywhere among your other scripts - it won't interfere:
```html
<script src="https://other-vendor.com/analytics.js"></script>
<script src="https://test-mu-cyan-21.vercel.app/supreme-boost/boost.js"
        data-shop-prompt="ร้านนี้ชื่อ My Shop"
        async>
</script>
<script src="https://other-vendor.com/ads.js"></script>
```

---

## What the Widget Does

✅ Appears as a chat button in the bottom-right corner  
✅ Reads your page content to answer questions  
✅ Supports multiple languages (Thai, English, Chinese, Japanese)
✅ Allows text resizing and dark mode toggle
✅ Falls back to page content if AI is unavailable  
✅ Fully customizable appearance and behavior
✅ **Works on ANY website** - Shopify, WordPress, custom HTML, etc.

---

## Need Your Vercel Domain?

1. Deploy the project to Vercel (see SETUP.md)
2. Your domain will look like: `supreme-boost-prod.vercel.app`
3. Replace `YOUR-VERCEL-DOMAIN` in the code above

---

## Example: E-Commerce Store

```html
<script src="https://my-store.vercel.app/supreme-boost/boost.js"
        data-shop-prompt="Welcome to Tech Store! We sell electronics and gadgets. Free shipping on orders over $50."
        data-title="Store Assistant"
        data-primary="#ff6b6b"
        data-position="left"
        defer>
</script>
```

---

## Example: Restaurant Website

```html
<script src="https://my-restaurant.vercel.app/supreme-boost/boost.js"
        data-lang="th"
        data-shop-prompt="ยินดีต้อนรับสู่ร้านอาหาร บิ๊ก บิจ เราเสิร์ฟอาหารไทยแท้ เปิดทุกวัน 10:00-22:00 โทรสั่งอาหาร 02-XXXX-XXXX"
        data-title="ร้านบิ๊ก บิจ"
        data-primary="#d4a574"
        defer>
</script>
```

---

## Questions?

See the full documentation in README.md or SETUP.md
