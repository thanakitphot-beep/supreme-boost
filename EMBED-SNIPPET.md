# Supreme AI Widget - Embed Code

> **Copy this code and paste it into your website's HTML to add Supreme AI chat widget**

---

## Basic (Copy & Paste)

```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
        data-shop-prompt="ร้านนี้ชื่อ My Shop"
        defer>
</script>
```

**Replace `YOUR-VERCEL-DOMAIN` with your actual Vercel domain**

---

## Full Featured

```html
<script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
        data-lang="auto"
        data-title="Customer AI Support"
        data-shop-prompt="ร้านนี้ชื่อ Supreme Shop ขายเสื้อผ้าวัยรุ่น มีโปรโมชันส่งฟรีเมื่อซื้อครบ 1000 บาท"
        data-primary="#2563eb"
        data-position="right"
        data-open="false"
        defer>
</script>
```

---

## Configuration Guide

| Attribute | Example | Description |
|-----------|---------|-------------|
| `data-shop-prompt` | `"ร้านนี้ชื่อ..."` | **Required**: Shop info for AI context |
| `data-lang` | `"auto"` | Language: auto/th/en/zh/ja |
| `data-title` | `"Customer Support"` | Widget header title |
| `data-primary` | `"#2563eb"` | Primary color |
| `data-position` | `"right"` | Position: left/right |
| `data-open` | `"false"` | Open on page load: true/false |
| `data-greeting` | `"Hi there!"` | Custom greeting message |

---

## Where to Paste

You can paste the `<script>` tag **anywhere** inside your HTML. Usually, people put it right before the closing `</body>` tag or in the `<head>` tag.

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
    <!-- You can place it here in the head -->
    <script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js"
            data-shop-prompt="..."
            defer>
    </script>
</head>
<body>
    <!-- Your website content -->
    
    <!-- Or place it here anywhere in the body -->
    <!-- <script src="https://YOUR-VERCEL-DOMAIN.vercel.app/supreme-boost/boost.js" ... defer></script> -->
</body>
</html>
```

---

## What the Widget Does

✅ Appears as a chat button in the bottom-right corner  
✅ Reads your page content to answer questions  
✅ Supports multiple languages  
✅ Allows text resizing and dark mode  
✅ Falls back to page content if AI is unavailable  
✅ 100% customizable appearance  

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
