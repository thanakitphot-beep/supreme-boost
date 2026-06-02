export function init(app) {
const panel = document.createElement("div");

panel.innerHTML = ` <div id="sb-toggle">⚡ Supreme Boost</div>

```
<div id="sb-panel">
  <h3>Supreme Boost</h3>
  <div>Version 1.0</div>
  <hr>
  <div>✓ Dark Mode</div>
  <div>✓ Chat</div>
</div>
```

`;

const style = document.createElement("style");

style.textContent = `
#sb-toggle{
position:fixed;
top:20px;
right:20px;
background:#111;
color:#fff;
padding:10px 15px;
border-radius:8px;
cursor:pointer;
z-index:999999;
font-family:sans-serif;
}

```
#sb-panel{
  display:none;
  position:fixed;
  top:60px;
  right:20px;
  width:260px;
  background:white;
  border:1px solid #ddd;
  border-radius:10px;
  padding:15px;
  box-shadow:0 0 20px rgba(0,0,0,.15);
  z-index:999999;
  font-family:sans-serif;
}
```

`;

panel.appendChild(style);

app.appendChild(panel);

const toggle = panel.querySelector("#sb-toggle");
const menu = panel.querySelector("#sb-panel");

toggle.onclick = () => {
menu.style.display =
menu.style.display === "block"
? "none"
: "block";
};
}
