export function init(app){
  let btn = document.createElement("button");
  btn.textContent = "🌙";
  btn.style = "position:fixed;bottom:20px;right:20px;z-index:9999;background:#000;color:#fff;border:none;padding:10px;border-radius:5px;cursor:pointer;";
  btn.onclick = () => {
    document.documentElement.style.filter = 
      document.documentElement.style.filter === "invert(1) hue-rotate(180deg)" 
      ? "" 
      : "invert(1) hue-rotate(180deg)";
  };
  app.appendChild(btn);
}