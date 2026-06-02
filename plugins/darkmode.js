export function init(app) {
    const btn = document.createElement("button");
    btn.innerHTML = "🌙";
    btn.style.position = "fixed";
    btn.style.right = "20px";
    btn.style.bottom = "20px";
    btn.style.width = "45px";
    btn.style.height = "45px";
    btn.style.borderRadius = "50%";
    btn.style.border = "1px solid #ccc";
    btn.style.background = "#ffffff";
    btn.style.cursor = "pointer";
    btn.style.zIndex = "999999";
    btn.style.fontSize = "22px";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)";

    let isDark = false;
    btn.addEventListener("click", () => {
        isDark = !isDark;
        if (isDark) {
            document.body.style.backgroundColor = "#1e1e2e";
            document.body.style.color = "#ffffff";
            btn.innerHTML = "☀️";
        } else {
            document.body.style.backgroundColor = "#ffffff";
            document.body.style.color = "#000000";
            btn.innerHTML = "🌙";
        }
    });

    app.appendChild(btn);
}