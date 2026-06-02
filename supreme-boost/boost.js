(async function (b, d) {
const api =
"https://script.google.com/macros/s/AKfycbyojt3DGQYr6P1-ZwDu2EHPWNwvd3EvmfZwdVcsjD9LZ8Psrz1lMBITvD3Cll6cjeSI/exec";

const cdn =
"https://thanakitphot-beep.github.io/supreme-boost/plugins/";

try {
const r = await fetch(api);
const j = await r.json();

```
if (!j.plugins || !j.plugins.length) {
  console.log("No plugins");
  return;
}

const host = d.createElement("div");
host.id = "supreme-boost-root";
d.body.appendChild(host);

const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = '<div id="app"></div>';

const app = shadow.getElementById("app");

for (const plugin of j.plugins) {
  try {
    console.log("Loading:", plugin);

    const mod = await import(
      `${cdn}${plugin}.js?t=${Date.now()}`
    );

    if (typeof mod.init === "function") {
      mod.init(app);
      console.log("Loaded:", plugin);
    } else {
      console.error(
        "Missing init():",
        plugin
      );
    }
  } catch (err) {
    console.error(
      "Plugin failed:",
      plugin,
      err
    );
  }
}
```

} catch (err) {
console.error("Boost error:", err);
}
})(window, document);
