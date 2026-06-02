export function init(app) {
    if (!app || document.getElementById("supreme-darkmode-toggle")) return;

    const style = document.createElement("style");
    style.id = "supreme-darkmode-style";
    style.textContent = `
        html.supreme-darkmode-enabled body {
            background: #0f172a !important;
            color: #e5e7eb !important;
        }
        #supreme-darkmode-toggle {
            position: fixed;
            right: 20px;
            bottom: 20px;
            width: 46px;
            height: 46px;
            display: grid;
            place-items: center;
            border: 1px solid #cbd5e1;
            border-radius: 999px;
            background: #ffffff;
            color: #0f172a;
            cursor: pointer;
            z-index: 2147481999;
            box-shadow: 0 12px 28px rgba(15, 23, 42, .16);
            font-size: 18px;
            line-height: 1;
        }
        html.supreme-darkmode-enabled #supreme-darkmode-toggle {
            border-color: #334155;
            background: #1e293b;
            color: #ffffff;
        }
    `;
    document.head.appendChild(style);

    const button = document.createElement("button");
    button.id = "supreme-darkmode-toggle";
    button.type = "button";
    button.setAttribute("aria-label", "สลับธีมหน้าเว็บ");
    button.textContent = "◐";

    button.addEventListener("click", () => {
        document.documentElement.classList.toggle("supreme-darkmode-enabled");
    });

    app.appendChild(button);
}
