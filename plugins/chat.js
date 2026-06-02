export function init(app) {
const chat = document.createElement("div");

chat.innerHTML = `

  <div style="
    position:fixed;
    bottom:20px;
    left:20px;
    width:280px;
    height:320px;
    background:#fff;
    border:1px solid #ddd;
    border-radius:10px;
    overflow:hidden;
    z-index:999999;
    box-shadow:0 0 10px rgba(0,0,0,.15);
    font-family:sans-serif;
  ">
    <div style="
      background:#2563eb;
      color:#fff;
      padding:10px;
    ">
      Supreme Chat
    </div>

```
<div id="msgs"
     style="
     height:220px;
     overflow:auto;
     padding:10px;
     ">
</div>

<input id="msg"
  placeholder="Type message..."
  style="
  width:100%;
  border:none;
  border-top:1px solid #ddd;
  padding:10px;
  box-sizing:border-box;
  ">
```

  </div>
  `;

app.appendChild(chat);
}
