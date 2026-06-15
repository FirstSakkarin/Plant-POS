/* ════════════════════════════════════════════════════
   app.js — TreeSiri POS
   แก้ไขไฟล์นี้สำหรับ logic, API, การคำนวณ
   Ctrl+F หา section:
   CONFIG  STATE  SHEETS API  SYNC
   LOAD PRODUCTS / SALES / CUSTOMERS
   CART  PAYMENT  PROFIT SPLIT
   MANAGE PRODUCTS  DASHBOARD  PROFIT SCREEN
   HISTORY  CUSTOMERS  NAV  INIT
════════════════════════════════════════════════════ */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONFIG
   ⚠️  แก้ SHEET_ID, SCRIPT_URL, API_KEY ตรงนี้
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── CONFIG ────────────────────────────────────────────────
const SHEET_ID   = "1c_t89oC0p5setOKKu2vuPbkVb_NXPCJ8jh_O9pP4s-o";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz66FGof0-0IhtUh7XsPdCJPDWmwWDvc_aW4EB8VOz8hsgtohztsEE-MX1GVshLCceABw/exec";
const API_KEY    = "AIzaSyCRWFx2hsgTIN9PbS7cbbfadt8BgiiXJQc";
const BASE       = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`;
const EMOJIS     = ["🌿","🪴","🌳","🌹","🌺","🌸","🌼","🌻","🌵","🍃","💐","🌱","🌾","🍀","🎋","🎍","🌲","🍁","🍂","🌴","🌊","🌙","⭐","🦋"];
const MONTHS     = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   STATE  (ตัวแปร global ทั้งหมด)
   ไม่ควรแก้โดยตรง — ใช้ฟังก์ชันข้างล่างแทน
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── STATE ─────────────────────────────────────────────────
let products=[], sales=[], customers=[];
let cart={}, discMode="baht";
let barChart=null;
let editingProductId=null, deletingProductId=null;
let selectedCust=null, editingCustId=null, viewingCustId=null;
let imgTabMode="upload", imgBase64="", imgUrlValue="";
let dashFrom=null, dashTo=null;
let profitFrom=null, profitTo=null;
let _custPickerFromModal=false;

// Per-item Fah% overrides during checkout (rowId -> fahPct 0-100)
let payItemSplits={};
// ร้านที่ขายออก ในบิลนี้ ("fah" | "mom")
let selectedSaleStore=null;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SHEETS API  — อ่าน/เขียน Google Sheets
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── SHEETS API ────────────────────────────────────────────
async function sheetGet(range){
  const r=await fetch(`${BASE}/${encodeURIComponent(range)}?key=${API_KEY}`);
  if(!r.ok)throw new Error(r.status);
  return (await r.json()).values||[];
}
async function scriptPost(data){
  const r=await fetch(SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify(data)});
  if(!r.ok)throw new Error("HTTP "+r.status);
  const j=await r.json();
  if(!j.ok)throw new Error(j.error||"Script error");
  return j;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SYNC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── SYNC ──────────────────────────────────────────────────
function setSS(s){
  ["sdot","sdot2"].forEach(id=>{
    const d=document.getElementById(id);
    if(d)d.className="sdot"+(s==="loading"?" spin":s==="error"?" err":"");
  });
  ["slbl","slbl2"].forEach(id=>{
    const l=document.getElementById(id);
    if(l)l.textContent=s==="loading"?"Syncing...":s==="error"?"Error":"Sync";
  });
}
async function syncAll(){
  setSS("loading");
  try{await loadProducts();await loadSales();await loadCustomers();setSS("ok");toast("✅ Sync สำเร็จ");}
  catch(e){setSS("error");toast("❌ "+e.message);}
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   LOAD DATA
   Columns: Products A-H, Sales A-F, Customers A-E
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── LOAD PRODUCTS (A=name,B=lot,C=cat,D=price,E=stock,F=emoji,G=imgUrl,H=defaultPct,I=stockFah,J=stockMom) ──
// defaultPct = Fah's default % (0-100), shown as starting value in checkout split
// stockFah/stockMom = จำนวนต้นที่อยู่หน้าร้านฟ้า/ร้านแม่ (เป็นส่วนหนึ่งของ stock รวม ไม่ใช่แยกต่างหาก)
async function loadProducts(){
  const rows=await sheetGet("Products!A2:J");
  products=rows.map((r,i)=>({
    row:i+2,
    name:r[0]||"",lot:r[1]||"",cat:r[2]||"",
    price:parseFloat(r[3])||0,stock:parseInt(r[4])||0,
    emoji:r[5]||"🌿",imgUrl:r[6]||"",
    defaultPct:parseFloat(r[7])>=0?parseFloat(r[7]):50,   // Fah's default %
    stockFah:parseInt(r[8])||0,
    stockMom:parseInt(r[9])||0
  })).filter(p=>p.name);
  renderProds();renderProdList();
}

// ── LOAD SALES (A=date,B=items,C=subtotal,D=discount,E=total,F=custName) ──
// items format: name(lot)×qty×price×fahPct, ...
async function loadSales(){
  const rows=await sheetGet("Sales!A2:F");
  sales=rows.map(r=>({
    date:new Date(r[0]),
    itemsStr:r[1]||"",
    items:(r[1]||"").split(",").map(s=>{
      const p=s.trim().split("×");
      return{name:p[0]?.trim()||"",emoji:"🌿",qty:parseInt(p[1])||1,price:parseFloat(p[2])||0,fahPct:parseFloat(p[3])>=0?parseFloat(p[3]):50};
    }),
    subtotal:parseFloat(r[2])||0,
    discount:parseFloat(r[3])||0,
    total:parseFloat(r[4])||0,
    custName:r[5]||"",
    itemCount:(r[1]||"").split(",").reduce((a,s)=>{const p=s.split("×");return a+(parseInt(p[1])||1)},0)
  })).filter(s=>!isNaN(s.date.getTime())).reverse();
}

async function loadCustomers(){
  const rows=await sheetGet("Customers!A2:E");
  customers=rows.map((r,i)=>({row:i+2,name:r[0]||"",phone:r[1]||"",points:parseInt(r[2])||0,note:r[3]||"",totalSpent:parseFloat(r[4])||0})).filter(c=>c.name);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PRODUCTS UI  — หน้าขาย: categories, product grid
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── PRODUCTS UI ───────────────────────────────────────────
// สีของตัวเลข Fah % : 100% = เขียว (Fah ได้เต็ม), 50% = เหลือง (แบ่งกับแม่ครึ่งๆ), อื่นๆ/0% = แดง
function fahColor(pct){
  const p=pct??50;
  if(p===100)return"var(--g7)";
  if(p===50)return"var(--y7)";
  return"var(--r6)";
}
// วาดการ์ดสินค้าทั้งหมดในหน้า "ขาย" (.prod-grid)
// หมายเหตุ: สี/ขนาดบางส่วนของการ์ดถูกกำหนดแบบ inline style ในฟังก์ชันนี้
// (เช่น font-size:26px ของอิโมจิ, สี var(--g7) ของราคา) — ถ้าจะแก้สี/ขนาดเหล่านี้
// ให้แก้ตรงนี้ หรือย้ายไปใช้ class .pcard-emoji / .pcard-price ใน style.css แทน
function renderProds(){
  const q=(document.getElementById("s-input").value||"").toLowerCase();
  const f=products.filter(p=>(!q||p.name.toLowerCase().includes(q)||(p.lot||"").toLowerCase().includes(q)));
  const g=document.getElementById("prod-grid");
  if(!products.length){g.innerHTML=`<div style="grid-column:1/-1"><div class="empty-state"><i class="ti ti-refresh spin-icon"></i><p>กำลังโหลดจาก Google Sheets...</p></div></div>`;return}
  if(!f.length){g.innerHTML=`<div style="grid-column:1/-1;text-align:center;color:var(--faint);font-size:13px;padding:24px">ไม่พบสินค้า</div>`;return}

  const grouped={};
  f.forEach(p=>{if(!grouped[p.name])grouped[p.name]=[];grouped[p.name].push(p);});

  g.innerHTML=Object.values(grouped).map(lots=>{
    const rep=lots[0];
    const totalStock=lots.reduce((s,p)=>s+p.stock,0);
    const imgHtml=rep.imgUrl
      ?`<div style="position:relative;margin-bottom:6px"><img style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;background:var(--bg2)" src="${rep.imgUrl}" loading="lazy" onerror="this.style.display='none'"><span style="position:absolute;bottom:4px;right:6px;font-size:16px;background:rgba(255,255,255,.85);border-radius:6px;padding:2px 4px;line-height:1">${rep.emoji}</span></div>`
      :`<div style="font-size:26px;text-align:center;margin-bottom:5px;line-height:1">${rep.emoji}</div>`;

    if(lots.length>1){
      const chips=lots.map(p=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:7px;background:${p.stock<=0?"var(--bg3)":"var(--g1)"};border:0.5px solid ${p.stock<=0?"var(--bd)":"var(--g3)"};cursor:${p.stock>0?"pointer":"not-allowed"};margin-top:4px;opacity:${p.stock<=0?.55:1}"
             onclick="event.stopPropagation();${p.stock>0?`addCart(${p.row})`:`toast('❌ Lot นี้หมดแล้ว')`}">
          <span style="font-size:11px;font-weight:600;color:${p.stock<=0?"var(--faint)":"var(--g8)"}">${p.lot||"–"} <span style="color:${fahColor(p.defaultPct)}">Fah ${p.defaultPct??50}%</span></span>
          <span style="font-size:10px;color:${p.stock<=0?"var(--r6)":p.stock<=5?"var(--a6)":"var(--g7)"};font-weight:600">${p.stock<=0?"หมด":"คงเหลือ "+p.stock+" ต้น"}</span>
        </div>`).join("");
      return`<div class="pcard" style="cursor:default">
        ${imgHtml}
        <div style="font-size:12px;font-weight:600;color:var(--t);line-height:1.3">${rep.name}</div>
        <div style="font-size:13px;color:var(--g7);font-weight:600;margin-top:2px">฿${rep.price.toLocaleString()} <span style="font-size:10px;color:var(--m)">รวม ${totalStock} ต้น</span></div>
        ${chips}
      </div>`;
    }
    return`<div class="pcard${totalStock<=0?" pcard-empty":""}" onclick="${totalStock>0?`addCart(${rep.row})`:'toast("❌ สินค้าหมดแล้ว")'}">
      ${imgHtml}
      <div style="font-size:12px;font-weight:600;color:var(--t);line-height:1.3">${rep.name}</div>
      <span class="pbadge" style="background:var(--bg2);color:var(--m);font-size:10px">${rep.lot?rep.lot+" · ":""}<span style="color:${fahColor(rep.defaultPct)};font-weight:700">Fah ${rep.defaultPct??50}%</span></span>
      <div style="font-size:13px;color:var(--g7);font-weight:600;margin-top:2px">฿${rep.price.toLocaleString()}</div>
      <div style="font-size:10px;color:${totalStock<=5&&totalStock>0?"var(--r6)":"var(--faint)"};margin-top:2px">${totalStock<=0?"หมดแล้ว":"คงเหลือ "+totalStock+" ต้น"}</div>
    </div>`;
  }).join("");
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CART
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── CART ──────────────────────────────────────────────────
function addCart(rowId){
  const p=products.find(x=>x.row===rowId);
  if(!p||p.stock<=0)return;
  if(!cart[rowId])cart[rowId]={...p,customPrice:null,qty:0};
  if(cart[rowId].qty>=p.stock)return;
  cart[rowId].qty++;renderCart();
}
function chgQty(rowId,d){
  if(!cart[rowId])return;
  cart[rowId].qty+=d;
  if(cart[rowId].qty<=0)delete cart[rowId];
  renderCart();
}
function clearCart(){cart={};payItemSplits={};document.getElementById("disc-val").value="0";renderCart();}
function getItemPrice(item){return item.customPrice!==null?item.customPrice:item.price}
function getSubtotal(){return Object.values(cart).reduce((s,x)=>s+getItemPrice(x)*x.qty,0)}
function getDiscount(){
  const v=parseFloat(document.getElementById("disc-val").value)||0;
  const sub=getSubtotal();
  return discMode==="pct"?Math.min(sub,sub*v/100):Math.min(sub,v);
}
function getFinalTotal(){return Math.max(0,getSubtotal()-getDiscount())}

function renderCart(){
  const items=Object.values(cart);
  const count=items.reduce((s,x)=>s+x.qty,0);
  document.getElementById("cart-count").textContent=count;
  document.getElementById("pay-btn").disabled=count===0;
  const el=document.getElementById("cart-items");
  if(!items.length){el.innerHTML=`<div class="cart-empty">เลือกต้นไม้ด้านบน</div>`;renderTotal();return}
  el.innerHTML=items.map(x=>{
    const cp=getItemPrice(x);
    const isCustom=x.customPrice!==null&&x.customPrice!==x.price;
    const thumb=x.imgUrl?`<img src="${x.imgUrl}" style="width:24px;height:24px;object-fit:cover;border-radius:5px">`:x.emoji;
    return`<div class="crow">
      <span class="crow-emoji">${thumb}</span>
      <span class="crow-name">${x.name}${x.lot?`<br><span style="font-size:9px;color:var(--a6)">${x.lot}</span>`:""}</span>
      <div class="qty-ctrl">
        <button class="qbtn" onclick="chgQty(${x.row},-1)">−</button>
        <span class="qnum">${x.qty}</span>
        <button class="qbtn" onclick="chgQty(${x.row},1)">+</button>
      </div>
      <div class="crow-price-wrap" onclick="openPriceEdit(${x.row})" title="แตะเพื่อแก้ราคา">
        <span class="crow-price">฿${(cp*x.qty).toLocaleString()}</span>
        <span class="crow-disc" style="color:${isCustom?"var(--a6)":"var(--faint)"}">฿${cp.toLocaleString()} ✎</span>
      </div>
    </div>`}).join("");
  renderTotal();
}
function renderTotal(){
  const sub=getSubtotal(),disc=getDiscount(),final=getFinalTotal();
  const orig=document.getElementById("total-orig"),amt=document.getElementById("total-amt");
  if(disc>0){orig.textContent="฿"+sub.toLocaleString();orig.style.display="";}else orig.style.display="none";
  amt.textContent="฿"+final.toLocaleString();
}
function setDiscMode(mode,btn){
  discMode=mode;
  document.querySelectorAll(".disc-tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("disc-unit").textContent=mode==="pct"?"%":"บาท";
  document.getElementById("disc-val").value="0";
  renderTotal();
}

// ── PRICE EDIT ────────────────────────────────────────────
function openPriceEdit(rowId){
  const item=cart[rowId];if(!item)return;
  const np=prompt(`แก้ราคา "${item.name}"${item.lot?" ("+item.lot+")":""}
ราคาปกติ: ฿${item.price}

กรอกราคาใหม่:`,item.customPrice??item.price);
  if(np===null)return;
  const p=parseFloat(np);
  if(isNaN(p)||p<0){toast("❌ ราคาไม่ถูกต้อง");return;}
  cart[rowId].customPrice=p;renderCart();
}

// ── CUSTOMER SELECTOR ─────────────────────────────────────
function syncModalCustBtn(){
  const btn=document.getElementById("modal-cust-btn");
  const clr=document.getElementById("modal-cust-clear");
  const lbl=document.getElementById("modal-cust-label");
  const pts=document.getElementById("pts-preview");
  const ptsTxt=document.getElementById("pts-preview-text");
  if(!btn)return;
  if(selectedCust){
    btn.className="cust-sel-btn selected";
    lbl.textContent=selectedCust.name+(selectedCust.phone?" · "+selectedCust.phone:"");
    if(clr)clr.style.display="flex";
    if(pts){
      const earned=Math.floor(getFinalTotal()/10);
      pts.style.display="flex";
      ptsTxt.textContent=`${selectedCust.name} มี ${selectedCust.points} แต้ม · บิลนี้ +${earned} → รวม ${selectedCust.points+earned} แต้ม`;
    }
  }else{
    btn.className="cust-sel-btn";
    lbl.textContent="เลือกลูกค้า (ไม่บังคับ)";
    if(clr)clr.style.display="none";
    if(pts)pts.style.display="none";
  }
}
function openCustPickerFromModal(){_custPickerFromModal=true;openCustPicker();}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PROFIT SPLIT  — % Fah ต่อรายการในหน้าชำระเงิน
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── PROFIT SPLIT AT CHECKOUT ────────────────────────────
// payItemSplits: rowId -> fahPct (0-100, how much Fah gets)
function renderPayProfitSplits(){
  const el=document.getElementById("pay-profit-splits");
  if(!el)return;
  const items=Object.values(cart);
  if(!items.length){el.innerHTML="";return}
  el.innerHTML=
    `<div style="font-size:12px;color:var(--m);font-weight:600;margin-bottom:5px">แบ่ง % กำไรต่อรายการ <span style="font-weight:400">(🌿 Fah ได้กี่ %)</span></div>`+
    items.map(x=>{
      // Default = product's defaultPct; override via payItemSplits
      if(payItemSplits[x.row]===undefined) payItemSplits[x.row]=x.defaultPct??50;
      const fahPct=payItemSplits[x.row];
      const momPct=100-fahPct;
      const rev=getItemPrice(x)*x.qty;
      const thumb=x.imgUrl?`<img src="${x.imgUrl}" style="width:20px;height:20px;object-fit:cover;border-radius:4px">`:x.emoji;
      return`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--bd)">
        <span style="font-size:15px;flex-shrink:0">${thumb}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--t);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.name}${x.lot?" ("+x.lot+")":""}</div>
          <div style="font-size:10px;color:var(--m)">฿${rev.toLocaleString()} · <span style="color:var(--g7)">🌿 ฿${Math.round(rev*fahPct/100).toLocaleString()}</span> / <span style="color:var(--p7)">🌸 ฿${Math.round(rev*momPct/100).toLocaleString()}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <span style="font-size:11px;color:var(--m)">Fah</span>
          <input type="number" min="0" max="100" value="${fahPct}"
            style="width:54px;padding:5px 6px;border-radius:7px;border:0.5px solid var(--bd);background:var(--bg2);font-size:13px;font-family:'Sarabun',sans-serif;color:var(--t);text-align:center;outline:none"
            oninput="updateFahSplit(${x.row},this.value,this)">
          <span style="font-size:11px;color:var(--m)">%</span>
        </div>
      </div>`;
    }).join("")+`<div style="height:4px"></div>`;
}
function updateFahSplit(rowId,val,inp){
  let v=parseFloat(val);if(isNaN(v))v=50;
  v=Math.max(0,Math.min(100,Math.round(v)));
  payItemSplits[rowId]=v;
  // Update subtotal display
  const item=cart[rowId];if(!item)return;
  const rev=getItemPrice(item)*item.qty;
  const row=inp?.closest("div[style*='border-bottom']");
  if(row){
    const info=row.querySelector("div[style*='font-size:10px']");
    if(info)info.innerHTML=`฿${rev.toLocaleString()} · <span style="color:var(--g7)">🌿 ฿${Math.round(rev*v/100).toLocaleString()}</span> / <span style="color:var(--p7)">🌸 ฿${Math.round(rev*(100-v)/100).toLocaleString()}</span>`;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PAYMENT  — openPay, confirmSale
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── PAYMENT ───────────────────────────────────────────────
function openPay(){
  payItemSplits={};
  const items=Object.values(cart);
  const final=getFinalTotal(),disc=getDiscount();
  document.getElementById("pay-total").textContent="฿"+final.toLocaleString();
  let summary=items.map(x=>`${x.imgUrl?`<img src="${x.imgUrl}" style="width:13px;height:13px;object-fit:cover;border-radius:3px;vertical-align:-2px">`:x.emoji} ${x.name}${x.lot?" ("+x.lot+")":""} ×${x.qty} = ฿${(getItemPrice(x)*x.qty).toLocaleString()}`).join("<br>");
  if(disc>0)summary+=`<br>🏷 ส่วนลด −฿${disc.toLocaleString()}`;
  document.getElementById("pay-summary").innerHTML=summary;
  document.getElementById("recv-inp").value="";
  document.getElementById("change-box").textContent="";
  document.getElementById("change-box").className="change-box";
  document.getElementById("pay-ok").disabled=true;
  payItemSplits={};
  selectedSaleStore=null;
  document.querySelectorAll(".pt-btn[id^='store-']").forEach(b=>b.classList.remove("active"));
  syncModalCustBtn();
  renderPayProfitSplits();
  document.getElementById("pay-overlay").classList.add("show");
  setTimeout(()=>document.getElementById("recv-inp").focus(),200);
}
function closePay(){document.getElementById("pay-overlay").classList.remove("show")}
function selectSaleStore(store,btn){
  selectedSaleStore=store;
  document.querySelectorAll(".pt-btn[id^='store-']").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  calcChange();
}
function calcChange(){
  const recv=parseFloat(document.getElementById("recv-inp").value)||0;
  const total=getFinalTotal();
  const el=document.getElementById("change-box"),btn=document.getElementById("pay-ok");
  const ready=!!selectedSaleStore;
  if(recv>=total){el.textContent="เงินทอน ฿"+(recv-total).toLocaleString();el.className="change-box change-ok";btn.disabled=!ready;}
  else if(recv>0){el.textContent="ขาดอีก ฿"+(total-recv).toLocaleString();el.className="change-box change-err";btn.disabled=true;}
  else{el.textContent="";el.className="change-box";btn.disabled=true;}
  if(recv>=total&&!ready)el.textContent+=" · กรุณาเลือกร้านที่ขายออก";
}

// ── PAYMENT CONFIRM ─────────────────────────────────────
async function confirmSale(){
  const items=Object.values(cart);
  const sub=getSubtotal(),disc=getDiscount(),total=getFinalTotal();
  const now=new Date();
  const btn=document.getElementById("pay-ok");
  btn.disabled=true;btn.textContent="กำลังบันทึก...";
  try{
    const itemStr=items.map(x=>{
      const fahPct=payItemSplits[x.row]!==undefined?payItemSplits[x.row]:(x.defaultPct??50);
      return x.name+(x.lot?"("+x.lot+")":"")+"×"+x.qty+"×"+getItemPrice(x)+"×"+fahPct;
    }).join(", ");
    const dd=now.getDate(),mm=now.getMonth()+1,yy=now.getFullYear();
    const hh=String(now.getHours()).padStart(2,"0"),mn=String(now.getMinutes()).padStart(2,"0");
    const dateStr=dd+"/"+mm+"/"+yy+" "+hh+":"+mn;
    const custName=selectedCust?selectedCust.name:"";
    await scriptPost({action:"addSale",date:dateStr,items:itemStr,subtotal:sub,discount:disc,total,custName});
    let negativeWarn=false;
    for(const x of items){
      const p=products.find(q=>q.row===x.row);
      if(p){
        p.stock-=x.qty;
        await scriptPost({action:"updateStock",row:p.row,stock:p.stock});
        if(selectedSaleStore==="fah"){p.stockFah=(p.stockFah||0)-x.qty;}
        else if(selectedSaleStore==="mom"){p.stockMom=(p.stockMom||0)-x.qty;}
        if((p.stockFah||0)<0||(p.stockMom||0)<0)negativeWarn=true;
        await scriptPost({action:"updateStockLocations",row:p.row,stockFah:p.stockFah||0,stockMom:p.stockMom||0});
      }
    }
    if(selectedCust){
      const earned=Math.floor(total/10);
      const newPts=selectedCust.points+earned;
      const newSpent=(selectedCust.totalSpent||0)+total;
      const c=customers.find(q=>q.row===selectedCust.row);
      if(c){c.points=newPts;c.totalSpent=newSpent;}
      await scriptPost({action:"updateCustomer",row:selectedCust.row,name:selectedCust.name,phone:selectedCust.phone,points:newPts,note:selectedCust.note||"",totalSpent:newSpent});
      toast("✅ บันทึกแล้ว · "+selectedCust.name+" +"+earned+" แต้ม!");
    }
    const fPct=payItemSplits;
    sales.unshift({date:now,items:items.map(x=>({name:x.name,emoji:x.emoji,lot:x.lot,price:getItemPrice(x),qty:x.qty,fahPct:fPct[x.row]!==undefined?fPct[x.row]:(x.defaultPct??50)})),subtotal:sub,discount:disc,total,custName:selectedCust?selectedCust.name:"",itemCount:items.reduce((s,x)=>s+x.qty,0)});
    const hadCust=!!selectedCust;
    clearSelectedCust();
    cart={};document.getElementById("disc-val").value="0";
    selectedSaleStore=null;
    renderCart();renderProds();renderProdList();closePay();
    openReceipt(sales[0]);
    if(negativeWarn)toast("⚠️ สต็อกหน้าร้านติดลบ กรุณาตรวจสอบ/ย้ายสต็อก");
    else if(!hadCust)toast("✅ บันทึกลง Google Sheets แล้ว!");
  }catch(e){
    toast("❌ บันทึกไม่สำเร็จ: "+e.message);
    btn.disabled=false;btn.textContent="ยืนยันการขาย";
  }
}

function setImgTab(mode,btn){
  imgTabMode=mode;
  document.querySelectorAll(".img-tab").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  const ua=document.getElementById("img-upload-area"),ui=document.getElementById("f-img-url");
  if(ua)ua.style.display=mode==="upload"?"block":"none";
  if(ui)ui.style.display=mode==="url"?"block":"none";
}
function handleImgUpload(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    imgBase64=ev.target.result;
    const preview=document.getElementById("img-preview"),hint=document.getElementById("img-upload-hint");
    if(preview){preview.src=imgBase64;preview.style.display="block";}
    if(hint)hint.style.display="none";
  };
  reader.readAsDataURL(file);
}
function previewImgUrl(){imgUrlValue=document.getElementById("f-img-url")?.value.trim()||"";}
function getImgForSave(){return imgTabMode==="url"?(document.getElementById("f-img-url")?.value.trim()||""):imgBase64;}
function resetImgFields(){
  imgBase64="";imgUrlValue="";
  const preview=document.getElementById("img-preview"),hint=document.getElementById("img-upload-hint");
  if(preview){preview.src="";preview.style.display="none";}
  if(hint)hint.style.display="block";
  const fi=document.getElementById("f-img-file");if(fi)fi.value="";
  const fu=document.getElementById("f-img-url");if(fu)fu.value="";
  const tab=document.querySelector(".img-tab");if(tab)setImgTab("upload",tab);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PRODUCT FORM  — default Fah %
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── PRODUCT FORM: default Fah % ─────────────────────────
function setDefaultPct(pct, btn){
  document.getElementById("f-default-pct").value=pct;
  syncDefaultPctBtns(pct);
}
// ── สต็อกแยกตามร้าน: แสดงจำนวนที่เหลือในสวน = รวม - ฟ้า - แม่ ──
function updateStockBreakdownHint(){
  const hint=document.getElementById("stock-breakdown-hint");
  if(!hint)return;
  const total=parseInt(document.getElementById("f-stock").value)||0;
  const fah=parseInt(document.getElementById("f-stock-fah").value)||0;
  const mom=parseInt(document.getElementById("f-stock-mom").value)||0;
  const garden=total-fah-mom;
  hint.textContent=`🏡 เหลือในสวน: ${garden} ต้น`;
  hint.style.color=garden<0?"var(--r6)":"var(--faint)";
}
function syncDefaultPctBtns(val){
  const v=parseFloat(val);
  document.querySelectorAll(".pt-btn").forEach(b=>{
    b.classList.remove("active");
    if(parseFloat(b.dataset.pct)===v) b.classList.add("active");
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MANAGE PRODUCTS  — รายการสินค้า, เพิ่ม/แก้/ลบ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── MANAGE PRODUCTS ───────────────────────────────────────
function renderProdList(){
  const el=document.getElementById("prod-list");
  if(!products.length){el.innerHTML=`<div style="grid-column:1/-1"><div class="empty-state"><i class="ti ti-plant"></i><p>ยังไม่มีสินค้า กด "+ เพิ่มสินค้า"</p></div></div>`;return}
  const grouped={};
  products.forEach(p=>{if(!grouped[p.name])grouped[p.name]=[];grouped[p.name].push(p);});
  el.innerHTML=Object.entries(grouped).map(([name,lots])=>{
    const totalStock=lots.reduce((s,p)=>s+p.stock,0);
    const rep=lots[0];
    const headerHtml=`<div style="grid-column:1/-1;display:flex;align-items:center;gap:7px;margin:6px 0 2px">
      <span style="font-size:13px;font-weight:700;color:var(--t)">${rep.emoji} ${name}</span>
      <span style="font-size:11px;color:var(--m)">รวม ${totalStock} ต้น · ${lots.length} Lot</span>
      <button class="add-btn" style="margin-left:auto;padding:5px 10px;font-size:11px" onclick="openProductFormNewLot('${name}')">+ Lot</button>
    </div>`;
    const cards=lots.map(p=>{
      const imgHtml=p.imgUrl
        ?`<div style="position:relative;margin-bottom:6px"><img style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;background:var(--bg2)" src="${p.imgUrl}" loading="lazy" onerror="this.style.display='none'"><span style="position:absolute;bottom:4px;right:6px;font-size:16px;background:rgba(255,255,255,.85);border-radius:6px;padding:2px 4px;line-height:1">${p.emoji}</span></div>`
        :`<div style="font-size:26px;text-align:center;margin-bottom:5px;line-height:1">${p.emoji}</div>`;
      const fah=p.stockFah||0,mom=p.stockMom||0,garden=p.stock-fah-mom;
      return`<div class="pcard mcard" style="cursor:default">
        ${imgHtml}
        <div style="font-size:12px;font-weight:600;color:var(--t);line-height:1.3">${p.lot||name}</div>
        <div style="font-size:13px;color:var(--g7);font-weight:600;margin-top:2px">฿${p.price.toLocaleString()}</div>
        <div style="font-size:10px;color:${p.stock<=0?"var(--r6)":p.stock<=5?"var(--a6)":"var(--faint)"};margin-top:2px">${p.stock<=0?"หมดแล้ว":"คงเหลือ "+p.stock+" ต้น"}</div>
        <div style="font-size:10px;color:var(--m);margin-top:3px;line-height:1.5">🏡สวน ${garden} · 🔵ฟ้า ${fah} · 🟢แม่ ${mom}</div>
        <span class="pbadge" style="background:var(--g1);color:var(--g8);font-size:10px">Fah ${p.defaultPct??50}%</span>
        <div class="mcard-actions">
          <button class="mcard-btn" onclick="openTransferModal(${p.row})" title="ย้ายสต็อก"><i class="ti ti-arrows-exchange"></i></button>
          <button class="mcard-btn" onclick="openProductForm(${p.row})"><i class="ti ti-edit"></i></button>
          <button class="mcard-btn del" onclick="openDelModal(${p.row})"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
    }).join("");
    return headerHtml+cards;
  }).join("");
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ย้ายสต็อก (สวน / ร้านฟ้า / ร้านแม่)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let transferringRow=null;
function openTransferModal(row){
  transferringRow=row;
  const p=products.find(x=>x.row===row);
  if(!p)return;
  const fah=p.stockFah||0,mom=p.stockMom||0,garden=p.stock-fah-mom;
  document.getElementById("transfer-name").textContent=`${p.emoji} ${p.name}${p.lot?" ("+p.lot+")":""}`;
  document.getElementById("transfer-current").innerHTML=`🏡 สวน ${garden} ต้น &nbsp;·&nbsp; 🔵 ร้านฟ้า ${fah} ต้น &nbsp;·&nbsp; 🟢 ร้านแม่ ${mom} ต้น &nbsp;·&nbsp; รวม ${p.stock} ต้น`;
  document.getElementById("tr-from").value="garden";
  document.getElementById("tr-to").value="fah";
  document.getElementById("tr-qty").value="";
  document.getElementById("transfer-overlay").classList.add("show");
}
function closeTransferModal(){document.getElementById("transfer-overlay").classList.remove("show")}
async function confirmTransfer(){
  const p=products.find(x=>x.row===transferringRow);
  if(!p)return;
  const from=document.getElementById("tr-from").value;
  const to=document.getElementById("tr-to").value;
  const qty=parseInt(document.getElementById("tr-qty").value)||0;
  if(qty<=0){toast("❌ กรอกจำนวนที่จะย้าย");return;}
  if(from===to){toast("❌ เลือกตำแหน่งต้นทาง/ปลายทางให้ต่างกัน");return;}
  let fah=p.stockFah||0,mom=p.stockMom||0;
  const garden=()=>p.stock-fah-mom;
  const get=loc=>loc==="garden"?garden():loc==="fah"?fah:mom;
  if(get(from)<qty){toast(`⚠️ ต้นทางมีไม่พอ (มี ${get(from)} ต้น) แต่จะย้ายให้ตามจำนวนที่ระบุ`);}
  // ลดจากต้นทาง / เพิ่มที่ปลายทาง — garden คำนวณจาก stock-fah-mom จึงไม่ต้องเก็บค่าตรง
  if(from==="fah")fah-=qty; else if(from==="mom")mom-=qty;
  if(to==="fah")fah+=qty; else if(to==="mom")mom+=qty;
  try{
    await scriptPost({action:"updateStockLocations",row:p.row,stockFah:fah,stockMom:mom});
    p.stockFah=fah;p.stockMom=mom;
    renderProdList();renderProds();closeTransferModal();
    toast("✅ ย้ายสต็อกแล้ว");
  }catch(e){toast("❌ "+e.message);}
}

function buildEmojiGrid(selected){
  document.getElementById("emoji-grid").innerHTML=EMOJIS.map(e=>
    `<div class="emoji-opt${e===selected?" selected":""}" onclick="pickEmoji('${e}')">${e}</div>`
  ).join("");
}
function pickEmoji(e){document.getElementById("f-emoji").value=e;buildEmojiGrid(e);}

function openProductForm(rowId=null){
  editingProductId=rowId;
  const p=rowId?products.find(x=>x.row===rowId):null;
  document.getElementById("prod-form-title").textContent=rowId?"แก้ไขสินค้า":"เพิ่มสินค้าใหม่";
  document.getElementById("f-name").value=p?.name||"";
  document.getElementById("f-lot").value=p?.lot||"";
  document.getElementById("f-price").value=p?.price||"";
  document.getElementById("f-stock").value=p?.stock??"";
  document.getElementById("f-stock-fah").value=p?.stockFah||0;
  document.getElementById("f-stock-mom").value=p?.stockMom||0;
  updateStockBreakdownHint();
  document.getElementById("f-emoji").value=p?.emoji||"🌿";
  buildEmojiGrid(p?.emoji||"🌿");
  resetImgFields();
  const dpct=p?.defaultPct??50;
  const dpctEl=document.getElementById("f-default-pct");
  if(dpctEl)dpctEl.value=dpct;
  syncDefaultPctBtns(dpct);
  if(p?.imgUrl){
    if(p.imgUrl.startsWith("http")){
      const tab=document.querySelectorAll(".img-tab")[1];if(tab)setImgTab("url",tab);
      const ui=document.getElementById("f-img-url");if(ui)ui.value=p.imgUrl;imgUrlValue=p.imgUrl;
    }else if(p.imgUrl.startsWith("data:")){
      imgBase64=p.imgUrl;
      const preview=document.getElementById("img-preview"),hint=document.getElementById("img-upload-hint");
      if(preview){preview.src=p.imgUrl;preview.style.display="block";}
      if(hint)hint.style.display="none";
    }
  }
  document.getElementById("prod-overlay").classList.add("show");
  setTimeout(()=>document.getElementById("f-name").focus(),200);
}
function openProductFormNewLot(name){
  openProductForm(null);
  document.getElementById("f-name").value=name;
  document.getElementById("prod-form-title").textContent="เพิ่ม Lot ใหม่: "+name;
  const ex=products.find(p=>p.name===name);
  if(ex){document.getElementById("f-price").value=ex.price||"";
    const dpct2=ex.defaultPct??50;
    const el2=document.getElementById("f-default-pct");if(el2)el2.value=dpct2;
    syncDefaultPctBtns(dpct2);}
}
function closeProdForm(){document.getElementById("prod-overlay").classList.remove("show")}

async function saveProduct(){
  const name=document.getElementById("f-name").value.trim();
  const lot=document.getElementById("f-lot").value.trim();
  const existingP=editingProductId!==null?products.find(p=>p.row===editingProductId):products.find(p=>p.name===name);
  const cat=existingP?.cat||"";
  const price=parseFloat(document.getElementById("f-price").value)||0;
  const stock=parseInt(document.getElementById("f-stock").value)||0;
  const stockFah=parseInt(document.getElementById("f-stock-fah").value)||0;
  const stockMom=parseInt(document.getElementById("f-stock-mom").value)||0;
  const emoji=document.getElementById("f-emoji").value.trim()||"🌿";
  const imgUrl=getImgForSave();
  let defaultPct=parseFloat(document.getElementById("f-default-pct").value);
  if(isNaN(defaultPct))defaultPct=50;
  defaultPct=Math.max(0,Math.min(100,defaultPct));
  if(!name){toast("❌ กรุณากรอกชื่อต้นไม้");return;}
  const btn=document.getElementById("prod-save-btn");
  btn.disabled=true;btn.textContent="กำลังบันทึก...";
  try{
    if(editingProductId!==null){
      const row=editingProductId;
      await scriptPost({action:"updateProduct",row,name,lot,cat,price,stock,emoji,imgUrl,defaultPct,stockFah,stockMom});
      const idx=products.findIndex(p=>p.row===row);
      if(idx>=0)products[idx]={...products[idx],name,lot,cat,price,stock,emoji,imgUrl,defaultPct,stockFah,stockMom};
    }else{
      await scriptPost({action:"addProduct",name,lot,cat,price,stock,emoji,imgUrl,defaultPct,stockFah,stockMom});
      await loadProducts();
    }
    renderProds();renderProdList();closeProdForm();
    toast(editingProductId!==null?"✅ แก้ไขสินค้าแล้ว":"✅ เพิ่มสินค้าแล้ว");
  }catch(e){toast("❌ "+e.message);}
  finally{btn.disabled=false;btn.textContent="บันทึก";}
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DELETE PRODUCT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── DELETE ────────────────────────────────────────────────
function openDelModal(rowId){
  deletingProductId=rowId;
  const p=products.find(x=>x.row===rowId);
  document.getElementById("del-name").textContent=p?`${p.emoji} ${p.name}${p.lot?" ("+p.lot+")":""}`:""
  document.getElementById("del-overlay").classList.add("show");
}
function closeDelModal(){document.getElementById("del-overlay").classList.remove("show")}
async function confirmDelete(){
  const row=deletingProductId;
  try{
    await scriptPost({action:"deleteProduct",row});
    products=products.filter(p=>p.row!==row);
    renderProds();renderProdList();closeDelModal();toast("🗑 ลบสินค้าแล้ว");
  }catch(e){toast("❌ "+e.message);}
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DASHBOARD  — date presets, chart, top products
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── DASHBOARD ─────────────────────────────────────────────
function setPreset(preset,btn){
  document.querySelectorAll("#date-presets .preset-btn").forEach(b=>b.classList.remove("active"));
  if(btn)btn.classList.add("active");
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const cr=document.getElementById("custom-range");
  if(cr)cr.style.display=preset==="custom"?"flex":"none";
  if(preset==="today"){dashFrom=dashTo=today;}
  else if(preset==="7d"){dashFrom=new Date(today-6*864e5);dashTo=today;}
  else if(preset==="30d"){dashFrom=new Date(today-29*864e5);dashTo=today;}
  else if(preset==="mtd"){dashFrom=new Date(now.getFullYear(),now.getMonth(),1);dashTo=today;}
  else if(preset==="custom")return;
  renderDash();
}
function renderDash(){
  if(document.getElementById("custom-range")?.style.display==="flex"){
    const f=document.getElementById("date-from")?.value,t=document.getElementById("date-to")?.value;
    if(f)dashFrom=new Date(f);if(t)dashTo=new Date(t);
  }
  const from=dashFrom||new Date(new Date().setHours(0,0,0,0));
  const toEnd=new Date(dashTo||from);toEnd.setHours(23,59,59,999);
  const ms=sales.filter(s=>{const d=new Date(s.date);return d>=from&&d<=toEnd;});
  const totalRev=ms.reduce((s,x)=>s+x.total,0);
  const bills=ms.length,avg=bills?Math.round(totalRev/bills):0;
  const totalDisc=ms.reduce((s,x)=>s+(x.discount||0),0);
  const totalItems=ms.reduce((s,x)=>s+x.itemCount,0);
  const rangeMs=toEnd-from;
  const prevEnd=new Date(from-1),prevStart=new Date(from-rangeMs-1);
  const ps=sales.filter(s=>{const d=new Date(s.date);return d>=prevStart&&d<=prevEnd;});
  const prevRev=ps.reduce((s,x)=>s+x.total,0);
  const pct=prevRev?Math.round((totalRev-prevRev)/prevRev*100):0;
  const byDay={};ms.forEach(s=>{const d=new Date(s.date);const k=`${d.getDate()}/${d.getMonth()+1}`;byDay[k]=(byDay[k]||0)+s.total;});
  const best=Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById("metric-grid").innerHTML=`
    <div class="metric"><div class="metric-lbl">ยอดรวม</div><div class="metric-val">฿${(totalRev/1000).toFixed(1)}k</div><div class="metric-sub ${pct>0?"up":pct<0?"down":"neu"}">${pct>0?"▲":pct<0?"▼":"–"} ${Math.abs(pct)}%</div></div>
    <div class="metric"><div class="metric-lbl">จำนวนบิล</div><div class="metric-val">${bills}</div><div class="metric-sub neu">เฉลี่ย ฿${avg.toLocaleString()}</div></div>
    <div class="metric"><div class="metric-lbl">ต้นไม้ที่ขาย</div><div class="metric-val">${totalItems}</div><div class="metric-sub neu">ต้น</div></div>
    <div class="metric"><div class="metric-lbl">ส่วนลดรวม</div><div class="metric-val">฿${Math.round(totalDisc).toLocaleString()}</div><div class="metric-sub neu">วันดี ${best?best[0]:"-"}</div></div>`;
  const dayList=[];const cur=new Date(from);
  while(cur<=toEnd){dayList.push(new Date(cur));cur.setDate(cur.getDate()+1);}
  const dayData=dayList.map(day=>{const next=new Date(day);next.setDate(next.getDate()+1);return ms.filter(s=>{const d=new Date(s.date);return d>=day&&d<next;}).reduce((a,x)=>a+x.total,0);});
  if(barChart){barChart.destroy();barChart=null;}
  const dark=window.matchMedia("(prefers-color-scheme:dark)").matches;
  barChart=new Chart(document.getElementById("bar-chart").getContext("2d"),{
    type:"bar",data:{labels:dayList.map(d=>d.getDate()+"/"+(d.getMonth()+1)),datasets:[{data:dayData,backgroundColor:"#3d7a14",borderRadius:3,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:v=>"฿"+Math.round(v.raw).toLocaleString()}}},
      scales:{x:{ticks:{font:{size:9,family:"Sarabun"},color:dark?"#636366":"#999",autoSkip:true,maxTicksLimit:10},grid:{display:false},border:{display:false}},
        y:{ticks:{font:{size:9,family:"Sarabun"},color:dark?"#636366":"#999",callback:v=>v>=1000?"฿"+(v/1000).toFixed(0)+"k":"฿"+v},grid:{color:dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)"},border:{display:false}}}}
  });
  const im={};
  ms.forEach(s=>s.items.forEach(it=>{
    if(!im[it.name])im[it.name]={name:it.name,emoji:it.emoji||"🌿",qty:0,rev:0};
    im[it.name].qty+=it.qty;im[it.name].rev+=it.qty*(it.price||0);
  }));
  const top=Object.values(im).sort((a,b)=>b.rev-a.rev).slice(0,5);
  document.getElementById("top-list").innerHTML=top.length?top.map((x,i)=>`
    <div class="top-item"><div class="top-rank">${i+1}</div><span class="top-emoji">${x.emoji}</span>
      <span class="top-name">${x.name}</span><span class="top-qty">${x.qty} ต้น</span>
      <span class="top-rev">฿${Math.round(x.rev).toLocaleString()}</span></div>`).join(""):`<div style="color:var(--faint);font-size:13px;padding:12px 0">ไม่มีข้อมูล</div>`;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PROFIT SCREEN  — สรุป Fah vs แม่
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── PROFIT SCREEN ─────────────────────────────────────────
function setProfitPreset(preset,btn){
  document.querySelectorAll("#profit-presets .preset-btn").forEach(b=>b.classList.remove("active"));
  if(btn)btn.classList.add("active");
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(preset==="today"){profitFrom=profitTo=today;}
  else if(preset==="7d"){profitFrom=new Date(today-6*864e5);profitTo=today;}
  else if(preset==="30d"){profitFrom=new Date(today-29*864e5);profitTo=today;}
  else if(preset==="mtd"){profitFrom=new Date(now.getFullYear(),now.getMonth(),1);profitTo=today;}
  renderProfit();
}
function renderProfit(){
  const from=profitFrom||new Date(new Date().setHours(0,0,0,0));
  const toEnd=new Date(profitTo||from);toEnd.setHours(23,59,59,999);
  const ms=sales.filter(s=>{const d=new Date(s.date);return d>=from&&d<=toEnd;});

  let totalRev=0,fahTotal=0,momTotal=0,totalItems=0;
  ms.forEach(s=>{
    totalRev+=s.total;
    s.items.forEach(it=>{
      const rev=it.qty*(it.price||0);
      const fPct=(it.fahPct>=0?it.fahPct:50)/100;
      fahTotal+=rev*fPct;
      momTotal+=rev*(1-fPct);
      totalItems+=it.qty;
    });
  });

  // Bill-level discount adjustment (proportional)
  const totalItemRev=fahTotal+momTotal;
  const totalDisc=ms.reduce((a,s)=>a+(s.discount||0),0);
  if(totalItemRev>0&&totalDisc>0){
    const r=1-totalDisc/totalItemRev;
    fahTotal*=r; momTotal*=r;
  }

  const bills=ms.length;
  const avg=bills?Math.round(totalRev/bills):0;

  document.getElementById("profit-metrics").innerHTML=`
    <div class="metric"><div class="metric-lbl">ยอดขายรวม</div><div class="metric-val">฿${Math.round(totalRev/1000*10)/10}k</div><div class="metric-sub neu">${bills} บิล</div></div>
    <div class="metric"><div class="metric-lbl">🌿 Fah ได้รวม</div><div class="metric-val" style="font-size:17px;color:var(--g7)">฿${Math.round(fahTotal).toLocaleString()}</div></div>
    <div class="metric"><div class="metric-lbl">🌸 แม่ได้รวม</div><div class="metric-val" style="font-size:17px;color:var(--p7)">฿${Math.round(momTotal).toLocaleString()}</div></div>
    <div class="metric"><div class="metric-lbl">ต้นไม้ที่ขาย</div><div class="metric-val">${totalItems}</div><div class="metric-sub neu">ต้น</div></div>`;

  // Breakdown by item name
  const byName={};
  ms.forEach(s=>s.items.forEach(it=>{
    const k=it.name;
    if(!byName[k])byName[k]={name:k,emoji:it.emoji||"🌿",qty:0,rev:0,fahRev:0,momRev:0};
    const rev=it.qty*(it.price||0);
    const fPct=(it.fahPct>=0?it.fahPct:50)/100;
    byName[k].qty+=it.qty;byName[k].rev+=rev;
    byName[k].fahRev+=rev*fPct;byName[k].momRev+=rev*(1-fPct);
  }));
  const sorted=Object.values(byName).sort((a,b)=>b.rev-a.rev);

  document.getElementById("profit-breakdown").innerHTML=`
    <div class="profit-block">
      <div class="profit-block-title"><i class="ti ti-calculator" style="color:var(--g7);font-size:18px"></i> สรุปกำไร</div>
      <div class="profit-line"><span class="p-lbl">ยอดขายรวม</span><span class="p-val">฿${Math.round(totalRev).toLocaleString()}</span></div>
      <div class="profit-line"><span class="p-lbl">🌿 Fah ได้</span><span class="p-val pv-ts">฿${Math.round(fahTotal).toLocaleString()}</span></div>
      <div class="profit-line"><span class="p-lbl">🌸 แม่ได้</span><span class="p-val pv-snp">฿${Math.round(momTotal).toLocaleString()}</span></div>
    </div>
    ${sorted.length?`<div class="profit-block">
      <div class="profit-block-title"><i class="ti ti-list" style="color:var(--m);font-size:16px"></i> แยกตามสินค้า</div>
      ${sorted.map(x=>`
        <div class="profit-line">
          <span class="p-lbl">${x.emoji} ${x.name} <span style="font-size:10px;color:var(--faint)">${x.qty} ต้น</span></span>
          <div style="text-align:right">
            <div class="p-val" style="font-size:12px">฿${Math.round(x.rev).toLocaleString()}</div>
            <div style="font-size:10px"><span style="color:var(--g7)">🌿฿${Math.round(x.fahRev).toLocaleString()}</span> / <span style="color:var(--p7)">🌸฿${Math.round(x.momRev).toLocaleString()}</span></div>
          </div>
        </div>`).join("")}
    </div>`:""}`;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HISTORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── HISTORY ───────────────────────────────────────────────
function getTodaySales(){
  const n=new Date();
  return sales.filter(s=>{const d=new Date(s.date);return d.getDate()===n.getDate()&&d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();});
}
function renderHistory(){
  const ts=getTodaySales();
  const rev=ts.reduce((s,x)=>s+x.total,0);
  document.getElementById("today-cards").innerHTML=`
    <div class="metric"><div class="metric-lbl">ยอดวันนี้</div><div class="metric-val">฿${rev.toLocaleString()}</div></div>
    <div class="metric"><div class="metric-lbl">บิลวันนี้</div><div class="metric-val">${ts.length} บิล</div></div>`;
  const hl=document.getElementById("hist-list");
  if(!sales.length){hl.innerHTML=`<div class="empty-state"><i class="ti ti-receipt"></i><p>ยังไม่มีประวัติ</p></div>`;return}
  hl.innerHTML=sales.slice(0,50).map((s,i)=>{
    const d=new Date(s.date);
    const ds=`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()+543} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    const discTxt=s.discount>0?` ส่วนลด −฿${s.discount.toLocaleString()}`:"";
    return`<div class="sale-card">
      <div class="sale-hdr"><span class="sale-date"><i class="ti ti-clock" style="font-size:10px"></i> ${ds}</span><span class="sale-badge">${s.itemCount} รายการ</span></div>
      <div class="sale-items-txt">${s.custName?`👤 ${s.custName} · `:""}${s.items.map(x=>`${x.emoji||"🌿"}${x.name}×${x.qty}`).join(" · ")}${discTxt?` · ${discTxt}`:""}</div>
      <div class="sale-foot">
        <div class="sale-total">฿${Math.round(s.total).toLocaleString()}</div>
        <button class="sale-print-btn" onclick="openReceipt(sales[${i}])" title="ออกบิล / พิมพ์"><i class="ti ti-printer"></i></button>
      </div>
    </div>`}).join("");
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CUSTOMERS  — list, form, picker, history
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── CUSTOMERS ─────────────────────────────────────────────
function renderCustList(){
  const q=(document.getElementById("cust-search-inp")?.value||"").toLowerCase();
  const el=document.getElementById("cust-list");if(!el)return;
  const f=customers.filter(c=>!q||c.name.toLowerCase().includes(q)||c.phone.includes(q));
  if(!f.length){el.innerHTML=`<div class="empty-state"><i class="ti ti-users"></i><p>${customers.length?"ไม่พบลูกค้า":"ยังไม่มีลูกค้า กด + เพิ่มลูกค้า"}</p></div>`;return}
  el.innerHTML=f.map(c=>`
    <div class="cust-card">
      <div class="cust-avatar">${c.name.charAt(0)}</div>
      <div class="cust-info"><div class="cust-name">${c.name}</div><div class="cust-meta">${c.phone||"ไม่มีเบอร์"}${c.note?" · "+c.note:""}</div></div>
      <span class="cust-points">${c.points} แต้ม</span>
      <div style="display:flex;gap:5px;margin-left:4px">
        <button class="pli-btn" onclick="openCustHist(${c.row})"><i class="ti ti-history"></i></button>
        <button class="pli-btn" onclick="openCustForm(${c.row})"><i class="ti ti-edit"></i></button>
      </div>
    </div>`).join("");
}
function openCustForm(rowId=null){
  editingCustId=rowId;
  const c=rowId?customers.find(x=>x.row===rowId):null;
  document.getElementById("cust-form-title").textContent=rowId?"แก้ไขลูกค้า":"เพิ่มลูกค้าใหม่";
  document.getElementById("cf-name").value=c?.name||"";
  document.getElementById("cf-phone").value=c?.phone||"";
  document.getElementById("cf-points").value=c?.points||0;
  document.getElementById("cf-note").value=c?.note||"";
  document.getElementById("cust-form-overlay").classList.add("show");
  setTimeout(()=>document.getElementById("cf-name").focus(),200);
}
function closeCustForm(){document.getElementById("cust-form-overlay").classList.remove("show")}
async function saveCustomer(){
  const name=document.getElementById("cf-name").value.trim();
  const phone=document.getElementById("cf-phone").value.trim();
  const points=parseInt(document.getElementById("cf-points").value)||0;
  const note=document.getElementById("cf-note").value.trim();
  if(!name){toast("❌ กรุณากรอกชื่อลูกค้า");return;}
  const btn=document.getElementById("cust-save-btn");
  btn.disabled=true;btn.textContent="กำลังบันทึก...";
  try{
    if(editingCustId){
      const c=customers.find(x=>x.row===editingCustId);
      await scriptPost({action:"updateCustomer",row:editingCustId,name,phone,points,note,totalSpent:c?.totalSpent||0});
      const idx=customers.findIndex(x=>x.row===editingCustId);
      if(idx>=0)customers[idx]={...customers[idx],name,phone,points,note};
    }else{
      await scriptPost({action:"addCustomer",name,phone,points,note,totalSpent:0});
      await loadCustomers();
    }
    renderCustList();closeCustForm();toast(editingCustId?"✅ แก้ไขลูกค้าแล้ว":"✅ เพิ่มลูกค้าแล้ว");
  }catch(e){toast("❌ "+e.message);}
  finally{btn.disabled=false;btn.textContent="บันทึก";}
}
function openCustPicker(){
  document.getElementById("picker-search").value="";
  renderPickerList();
  document.getElementById("cust-picker-overlay").classList.add("show");
}
function closeCustPicker(){document.getElementById("cust-picker-overlay").classList.remove("show")}
function renderPickerList(){
  const q=(document.getElementById("picker-search")?.value||"").toLowerCase();
  const f=customers.filter(c=>!q||c.name.toLowerCase().includes(q)||c.phone.includes(q));
  const el=document.getElementById("picker-list");
  if(!f.length){el.innerHTML=`<div style="text-align:center;color:var(--faint);font-size:13px;padding:16px">ไม่พบลูกค้า</div>`;return}
  el.innerHTML=f.map(c=>`
    <div class="cust-card" style="cursor:pointer" onclick="selectCust(${c.row})">
      <div class="cust-avatar">${c.name.charAt(0)}</div>
      <div class="cust-info"><div class="cust-name">${c.name}</div><div class="cust-meta">${c.phone||"ไม่มีเบอร์"}</div></div>
      <span class="cust-points">${c.points} แต้ม</span>
    </div>`).join("");
}
function selectCust(rowId){
  selectedCust=customers.find(c=>c.row===rowId);
  const btn=document.getElementById("cust-sel-btn"),clr=document.getElementById("cust-clear");
  if(btn){btn.className="cust-sel-btn selected";btn.innerHTML=`<i class="ti ti-user-check"></i><span>${selectedCust.name}${selectedCust.phone?" · "+selectedCust.phone:""}</span>`;}
  if(clr)clr.style.display="flex";
  closeCustPicker();syncModalCustBtn();
  toast(`👤 เลือกลูกค้า: ${selectedCust.name} · ⭐ ${selectedCust.points} แต้ม`);
}
function clearSelectedCust(){
  selectedCust=null;
  const btn=document.getElementById("cust-sel-btn"),clr=document.getElementById("cust-clear");
  if(btn){btn.className="cust-sel-btn";btn.innerHTML=`<i class="ti ti-user"></i><span>เลือกลูกค้า (ไม่บังคับ)</span>`;}
  if(clr)clr.style.display="none";
  syncModalCustBtn();
}
function openCustHist(rowId){
  viewingCustId=rowId;
  const c=customers.find(x=>x.row===rowId);if(!c)return;
  const custSales=sales.filter(s=>s.custName===c.name);
  document.getElementById("cust-hist-name").textContent=c.name;
  document.getElementById("cust-hist-meta").textContent=c.phone||"";
  document.getElementById("cust-hist-points").textContent=c.points+" แต้ม";
  const totalSpent=custSales.reduce((s,x)=>s+x.total,0),visits=custSales.length;
  document.getElementById("cust-hist-stats").innerHTML=`
    <div class="metric"><div class="metric-lbl">ยอดรวม</div><div class="metric-val" style="font-size:16px">฿${Math.round(totalSpent).toLocaleString()}</div></div>
    <div class="metric"><div class="metric-lbl">ครั้ง</div><div class="metric-val" style="font-size:16px">${visits}</div></div>
    <div class="metric"><div class="metric-lbl">เฉลี่ย</div><div class="metric-val" style="font-size:16px">฿${visits?Math.round(totalSpent/visits).toLocaleString():0}</div></div>`;
  const hl=document.getElementById("cust-hist-list");
  hl.innerHTML=custSales.length?custSales.slice(0,20).map(s=>{
    const d=new Date(s.date);
    return`<div class="cust-hist-item">
      <div class="cust-hist-date">${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()+543}</div>
      <div class="cust-hist-items">${s.items.map(x=>`${x.emoji||"🌿"}${x.name}×${x.qty}`).join(" · ")}</div>
      <div class="cust-hist-total">฿${Math.round(s.total).toLocaleString()}</div>
    </div>`}).join(""):`<div style="text-align:center;color:var(--faint);font-size:13px;padding:16px">ยังไม่มีประวัติ</div>`;
  document.getElementById("cust-hist-overlay").classList.add("show");
}
function closeCustHist(){document.getElementById("cust-hist-overlay").classList.remove("show")}
function selectCustFromHist(){if(viewingCustId){selectCust(viewingCustId);closeCustHist();}}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   NAVIGATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── NAV ───────────────────────────────────────────────────
function gotoScreen(name,btn){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.querySelectorAll(".tab,.sb-btn").forEach(t=>t.classList.remove("active"));
  document.getElementById("screen-"+name).classList.add("active");
  document.querySelectorAll(`[onclick*="gotoScreen(\'${name}\'"], [onclick*="gotoScreen('${name}'"]`).forEach(b=>b.classList.add("active"));
  if(name==="report"){
    if(!dashFrom)setPreset("today",document.querySelector("#date-presets .preset-btn"));else renderDash();
    renderHistory();
    if(!profitFrom)setProfitPreset("today",document.querySelector("#profit-presets .preset-btn"));else renderProfit();
  }
  if(name==="manage")renderProdList();
  if(name==="customers")renderCustList();
}

function toast(msg){
  const t=document.getElementById("toast");
  t.textContent=msg;t.classList.add("show");
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),2800);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   RECEIPT  — ออกบิล/ใบเสร็จ พร้อมสั่งพิมพ์ (ใช้ทั้งหน้าขายและประวัติการขาย)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function buildReceiptHTML(s){
  const d=new Date(s.date);
  const ds=`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()+543} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const itemsHtml=s.items.map(x=>`
    <div class="r-item">
      <div class="r-item-name">${x.emoji||"🌿"} ${x.name}${x.lot?" ("+x.lot+")":""}</div>
      <div class="r-item-line"><span>${x.qty} × ฿${x.price.toLocaleString()}</span><span>฿${(x.qty*x.price).toLocaleString()}</span></div>
    </div>`).join("");
  const discRow=s.discount>0?`<div class="r-row"><span>ส่วนลด</span><span>−฿${s.discount.toLocaleString()}</span></div>`:"";
  return `
    <div class="r-store">🌿 TreeSiri</div>
    <div class="r-sub">ใบเสร็จรับเงิน / Receipt</div>
    <div class="r-meta">${ds}${s.custName?` · 👤 ${s.custName}`:""}</div>
    <hr class="r-line">
    ${itemsHtml}
    <hr class="r-line">
    <div class="r-row"><span>รวม</span><span>฿${s.subtotal.toLocaleString()}</span></div>
    ${discRow}
    <div class="r-row r-total"><span>ยอดสุทธิ</span><span>฿${Math.round(s.total).toLocaleString()}</span></div>
    <div class="r-foot">ขอบคุณที่ใช้บริการ 🌿</div>`;
}
function openReceipt(s){
  if(!s)return;
  document.getElementById("receipt-body").innerHTML=buildReceiptHTML(s);
  document.getElementById("receipt-overlay").classList.add("show");
}
function closeReceipt(){document.getElementById("receipt-overlay").classList.remove("show")}
function printReceiptNow(){window.print()}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SWIPE-DOWN TO CLOSE POPUP — ลากแถบจับด้านบนของ popup ลง เพื่อปิด (= กดยกเลิก)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function initSheetSwipe(){
  document.querySelectorAll(".overlay[data-close]").forEach(overlay=>{
    const sheet=overlay.querySelector(".sheet");
    const handle=overlay.querySelector(".sheet-handle");
    if(!sheet||!handle)return;
    const closeFn=window[overlay.dataset.close];
    let startY=0,curY=0,dragging=false;

    handle.addEventListener("touchstart",e=>{
      startY=e.touches[0].clientY;curY=startY;dragging=true;
      sheet.style.transition="none";
    },{passive:true});

    handle.addEventListener("touchmove",e=>{
      if(!dragging)return;
      curY=e.touches[0].clientY;
      const dy=Math.max(0,curY-startY);   // ลากลงได้อย่างเดียว
      sheet.style.transform=`translateY(${dy}px)`;
    },{passive:true});

    handle.addEventListener("touchend",()=>{
      if(!dragging)return;
      dragging=false;
      sheet.style.transition="transform .25s ease";
      const dy=Math.max(0,curY-startY);
      if(dy>80){              // ลากลงเกิน 80px = ปิด
        sheet.style.transform=`translateY(100%)`;
        setTimeout(()=>{sheet.style.transform="";if(typeof closeFn==="function")closeFn();},180);
      }else{
        sheet.style.transform="";  // ลากไม่พอ ดีดกลับที่เดิม
      }
    });
  });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   INIT  — bootstrap เมื่อโหลดหน้า
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── INIT ──────────────────────────────────────────────────
(async()=>{renderProds();await syncAll();initSheetSwipe();})();

