// boost.js - เวอร์ชันขี้เกียจ พร้อมใช้ 2024
(async function(b,d){
  let api="https://script.google.com/macros/s/xxxxxxxxxx/exec"; // ใส่ API Apps Script ของมึงตรงนี้
  let cdn="https://thanakitphot-beep.github.io/supreme-boost/plugins/";
  
  try {
    let r=await fetch(api+"?domain="+b.location.hostname);
    let j=await r.json();
    if(!j.plugins||!j.plugins.length) return;
    
    let h=d.createElement("div");
    h.id="sn";
    d.body.appendChild(h);
    let s=h.attachShadow({mode:"open"});
    s.innerHTML='<div id="app"></div>';
    let a=s.getElementById("app");
    
    for(let p of j.plugins){
      try{
        let m=await import(cdn+p+".js");
        if(m.init) m.init(a);
      }catch(x){console.log("Plugin failed:",p)}
    }
  }catch(e){console.log("Boost error:",e)}
})(window,document);