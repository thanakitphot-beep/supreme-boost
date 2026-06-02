(function () {
const btn = document.createElement("button");

btn.textContent = "🌙";

btn.style.position = "fixed";
btn.style.bottom = "20px";
btn.style.right = "20px";
btn.style.zIndex = "999999";
btn.style.padding = "10px";

btn.onclick = () => {
document.body.classList.toggle("dark");
};

const style = document.createElement("style");

style.textContent = `     .dark {
      background:#111;
      color:white;
    }
  `;

document.head.appendChild(style);
document.body.appendChild(btn);
})();
