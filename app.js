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
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwafGn6aiLcDEose37teohLzl1v0ZTZb4FoyubaO8h9i8Qo5EM7q6zYA4QNJ9AYGjRYPg/exec";
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
// ต้นทุนอื่นๆ ในบิลนี้ [{label, amount}]
let extraCosts=[];
// ประวัติที่กำลังแก้ไข/ลบ
let editingSaleIdx=null, deletingSaleIdx=null;

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
   OFFLINE QUEUE — localStorage queue สำหรับ sync
   UI อัปเดตทันที, ส่ง Google Sheet ใน background
   ถ้า net ล้ม → queue รอ online กลับมาแล้ว sync เอง
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const Q_KEY="treesiri_opqueue";
function qGet(){try{return JSON.parse(localStorage.getItem(Q_KEY)||"[]");}catch{return[];}}
function qSave(q){try{localStorage.setItem(Q_KEY,JSON.stringify(q));}catch(e){console.warn("queue save failed",e);}}
function qEnqueue(action,payload){
  const q=qGet();
  q.push({id:Date.now()+"_"+Math.random().toString(36).slice(2,6),action,payload});
  qSave(q);qUpdateBadge();
}

let _qFlushing=false;
async function qFlush(){
  if(_qFlushing)return;
  const pending=qGet().filter(op=>!op.done);
  if(!pending.length){qUpdateBadge();return;}
  if(!navigator.onLine){qUpdateBadge();return;}
  _qFlushing=true;qUpdateBadge();
  for(const op of pending){
    try{
      await scriptPost({action:op.action,...op.payload});
      const all=qGet(),i=all.findIndex(x=>x.id===op.id);
      if(i>=0){all[i].done=true;qSave(all);}
    }catch(e){
      console.warn("qFlush stopped:",op.action,e.message);
      break; // หยุดทันทีถ้า network ล้ม รอ online event
    }
  }
  qSave(qGet().filter(op=>!op.done));
  _qFlushing=false;qUpdateBadge();
  // reload sales หลัง sync เสร็จ เพื่อให้ sheetRow ถูกต้อง (ใช้ลบบิลได้)
  if(!qGet().length) loadSales().catch(()=>{});
}

function qUpdateBadge(){
  const pending=qGet().filter(op=>!op.done).length;
  const el=document.getElementById("q-badge");
  if(!el)return;
  if(pending===0){el.style.display="none";}
  else{el.style.display="inline-flex";el.textContent=(_qFlushing?"⬆ ":"⏳ ")+pending;el.title="รอ sync "+pending+" รายการไปยัง Google Sheet";}
}

// sync อัตโนมัติเมื่อ internet กลับมา
window.addEventListener("online",()=>{toast("🌐 Online แล้ว — กำลัง sync...");qFlush();});
// flush ทุกครั้งที่เปิดแอป (กรณี queue ค้างจากครั้งก่อน)
window.addEventListener("load",()=>setTimeout(qFlush,2000));

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
// ── LOAD PRODUCTS (A=name,B=lot,C=cat,D=price,E=stock,F=emoji,G=imgUrl,H=defaultPct,I=stockFah,J=stockMom,K=cost) ──
// defaultPct = Fah's default % (0-100), shown as starting value in checkout split
// stockFah/stockMom = จำนวนต้นที่อยู่หน้าร้านฟ้า/ร้านแม่ (เป็นส่วนหนึ่งของ stock รวม ไม่ใช่แยกต่างหาก)
// cost = ต้นทุนต่อต้น (บาท) — ใส่ 0 ได้ถ้าไม่มีต้นทุน ใช้คำนวณกำไร/ต้นทุนรวมในหน้ารายงาน
async function loadProducts(){
  const rows=await sheetGet("Products!A2:L");
  products=rows.map((r,i)=>({
    row:i+2,
    name:r[0]||"",lot:r[1]||"",cat:r[2]||"",
    price:parseFloat(r[3])||0,stock:parseInt(r[4])||0,
    emoji:r[5]||"🌿",imgUrl:r[6]||"",
    defaultPct:parseFloat(r[7])>=0?parseFloat(r[7]):50,
    stockFah:parseInt(r[8])||0,
    stockMom:parseInt(r[9])||0,
    cost:parseFloat(r[10])||0,
    sortOrder:parseInt(r[11])||9999  // col L — ลำดับการแสดงผล
  })).filter(p=>p.name);
  // เรียงตาม sortOrder ก่อนวาด
  products.sort((a,b)=>(a.sortOrder||9999)-(b.sortOrder||9999));
  renderProds();renderProdList();
}

// หาสินค้าที่ตรงกับรายการขาย (ใช้คำนวณต้นทุน/กำไรในหน้ารายงาน)
// รายการขายบางส่วนเก็บชื่อรวม lot ไว้ในชื่อ เช่น "ปริกหางกระรอก(A)"
function findProductForItem(it){
  let name=it.name,lot=it.lot;
  if(lot===undefined){
    // ลอง exact match ก่อน (กรณีชื่อมีวงเล็บเป็นส่วนหนึ่งของชื่อ เช่น "สนออสเตรเลีย (ตั้ง)")
    const exact=products.find(p=>p.name===name&&(p.lot||"")==="");
    if(exact)return exact;
    // fallback: แกะ lot ออกจากชื่อ เช่น "ต้น(A)" → name="ต้น", lot="A"
    const m=(name||"").match(/^(.*)\((.*)\)$/);
    if(m){name=m[1].trim();lot=m[2].trim();}
  }
  return products.find(p=>p.name===name&&(p.lot||"")===(lot||""));
}

// ── LOAD SALES (A=date,B=items,C=subtotal,D=discount,E=total,F=custName) ──
// items format: name(lot)×qty×price×fahPct, ...

// แปลงวันที่จาก Sheet — รองรับทั้ง ISO (YYYY-MM-DDTHH:MM) และรูปแบบเก่า (DD/MM/YYYY HH:MM)
function parseSheetDate(str){
  if(!str)return new Date(NaN);
  const d=new Date(str);
  if(!isNaN(d.getTime()))return d;
  // รูปแบบเก่า: DD/MM/YYYY HH:MM หรือ D/M/YYYY H:MM
  const m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0));
  return new Date(NaN);
}

async function loadSales(){
  const rows=await sheetGet("Sales!A2:G");
  sales=rows.map((r,i)=>({
    sheetRow:i+2,  // row 1 = header, i=0 → row 2
    date:parseSheetDate(r[0]),
    itemsStr:r[1]||"",
    items:(r[1]||"").split(",").map(s=>{
      const p=s.trim().split("×");
      return{name:p[0]?.trim()||"",emoji:"🌿",qty:parseInt(p[1])||1,price:parseFloat(p[2])||0,fahPct:parseFloat(p[3])>=0?parseFloat(p[3]):50};
    }),
    subtotal:parseFloat(r[2])||0,
    discount:parseFloat(r[3])||0,
    total:parseFloat(r[4])||0,
    custName:r[5]||"",
    extraCosts:r[6]?JSON.parse(r[6]):[],
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
// เลือกร้านในหน้า POS (ก่อนเริ่มขาย)
function selectPosStore(store,btn){
  selectedSaleStore=store;
  document.querySelectorAll("[id^='pos-fah'],[id^='pos-mom']").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  // เปลี่ยน theme accent ทั้งหน้าจอตามร้านที่เลือก
  document.documentElement.dataset.store=store;
  renderProds();
}

function renderProds(){
  const g=document.getElementById("prod-grid");
  if(!products.length){g.innerHTML=`<div style="grid-column:1/-1"><div class="empty-state"><i class="ti ti-refresh spin-icon"></i><p>กำลังโหลดจาก Google Sheets...</p></div></div>`;return}

  // ยังไม่เลือกร้าน → แสดง prompt
  if(!selectedSaleStore){
    g.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:44px 20px 20px">
      <div style="font-size:38px;margin-bottom:12px">🏪</div>
      <div style="font-size:14px;font-weight:700;color:var(--t)">เลือกร้านก่อนเริ่มขาย</div>
      <div style="font-size:12px;color:var(--m);margin-top:6px">กดปุ่ม ร้านฟ้า หรือ ร้านแม่ ด้านบน</div>
    </div>`;
    return;
  }

  const storeKey=selectedSaleStore==="fah"?"stockFah":"stockMom";
  const rawQ=(document.getElementById("topbar-search-input")?.value||"").toLowerCase();
  const tokens=rawQ.trim().split(/\s+/).filter(Boolean);
  // แสดงทุกสินค้า (รวม out-of-stock) — กรองเฉพาะ search
  const f=products.filter(p=>{
    if(!tokens.length)return true;
    const hay=(p.name+" "+(p.lot||"")).toLowerCase();
    return tokens.every(t=>hay.includes(t));
  });
  // เรียง: มี stock ก่อน → หมด stock ไว้ท้าย
  f.sort((a,b)=>{
    const as=(a[storeKey]||0)>0?0:1;
    const bs=(b[storeKey]||0)>0?0:1;
    if(as!==bs)return as-bs;
    return(a.sortOrder||9999)-(b.sortOrder||9999);
  });
  if(!f.length){g.innerHTML=`<div style="grid-column:1/-1;text-align:center;color:var(--faint);font-size:13px;padding:24px">ไม่มีสินค้าที่ตรงกับคำค้นหา</div>`;return}

  const grouped={};
  f.forEach(p=>{if(!grouped[p.name])grouped[p.name]=[];grouped[p.name].push(p);});

  g.innerHTML=Object.values(grouped).map(lots=>{
    const rep=lots[0];
    // ใช้ stock ของร้านที่เลือกเท่านั้น
    const totalStoreStock=lots.reduce((s,p)=>s+(p[storeKey]||0),0);
    const imgHtml=rep.imgUrl
      ?`<div style="position:relative;margin-bottom:6px"><img style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;background:var(--bg2)" src="${rep.imgUrl}" loading="lazy" onerror="this.style.display='none'"><span style="position:absolute;bottom:4px;right:6px;font-size:16px;background:rgba(255,255,255,.85);border-radius:6px;padding:2px 4px;line-height:1">${rep.emoji}</span></div>`
      :`<div style="font-size:26px;text-align:center;margin-bottom:5px;line-height:1">${rep.emoji}</div>`;

    if(lots.length>1){
      const chips=lots.map(p=>{
        const ss=p[storeKey]||0;
        return`<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:7px;background:${ss<=0?"var(--bg3)":"var(--g1)"};border:0.5px solid ${ss<=0?"var(--bd)":"var(--g3)"};cursor:${ss>0?"pointer":"not-allowed"};margin-top:4px;opacity:${ss<=0?.55:1}"
             onclick="event.stopPropagation();${ss>0?`addCart(${p.row})`:`toast('❌ Lot นี้หมดในร้านนี้')`}">
          <span style="font-size:11px;font-weight:600;color:${ss<=0?"var(--faint)":"var(--g8)"}">${p.lot||"–"} <span style="color:${fahColor(p.defaultPct)}">Fah ${p.defaultPct??50}%</span></span>
          <span style="font-size:10px;color:${ss<=0?"var(--r6)":ss<=5?"var(--a6)":"var(--g7)"};font-weight:600">${ss<=0?"หมด":"คงเหลือ "+ss+" ต้น"}</span>
        </div>`;
      }).join("");
      return`<div class="pcard" data-row="${rep.row}" style="cursor:default">
        ${imgHtml}
        <div style="font-size:12px;font-weight:600;color:var(--t);line-height:1.3">${rep.name}</div>
        <div style="font-size:13px;color:var(--g7);font-weight:600;margin-top:2px">฿${rep.price.toLocaleString()} <span style="font-size:10px;color:var(--m)">รวม ${totalStoreStock} ต้น</span></div>
        ${chips}
      </div>`;
    }
    return`<div class="pcard${totalStoreStock<=0?" pcard-empty":""}" data-row="${rep.row}" onclick="${totalStoreStock>0?`addCart(${rep.row})`:""}" >
      ${imgHtml}
      <div style="font-size:12px;font-weight:600;color:var(--t);line-height:1.3">${rep.name}</div>
      <span class="pbadge" style="background:var(--bg2);color:var(--m);font-size:10px">${rep.lot?rep.lot+" · ":""}<span style="color:${fahColor(rep.defaultPct)};font-weight:700">Fah ${rep.defaultPct??50}%</span></span>
      <div style="font-size:13px;color:var(--g7);font-weight:600;margin-top:2px">฿${rep.price.toLocaleString()}</div>
      <div style="font-size:10px;color:${totalStoreStock<=5&&totalStoreStock>0?"var(--r6)":"var(--faint)"};margin-top:2px">${totalStoreStock<=0?"หมดแล้ว":"คงเหลือ "+totalStoreStock+" ต้น"}</div>
    </div>`;
  }).join("");
  initSortableGrid();
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CART
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── CART ──────────────────────────────────────────────────
function addCart(rowId){
  const p=products.find(x=>x.row===rowId);
  if(!p)return;
  if(!selectedSaleStore){toast("❌ กรุณาเลือกร้านก่อน");return;}
  const storeStock=selectedSaleStore==="fah"?(p.stockFah||0):(p.stockMom||0);
  if(storeStock<=0){toast("❌ สินค้าหมดในร้านนี้");return;}
  if(!cart[rowId])cart[rowId]={...p,customPrice:null,qty:0};
  if(cart[rowId].qty>=storeStock){toast("❌ เกินสต็อกของร้านนี้ ("+storeStock+" ต้น)");return;}
  cart[rowId].qty++;renderCart();
}
function chgQty(rowId,d){
  if(!cart[rowId])return;
  if(d>0&&selectedSaleStore){
    // ตรวจ stock ก่อนเพิ่ม
    const p=products.find(x=>x.row===rowId);
    const storeStock=p?(selectedSaleStore==="fah"?(p.stockFah||0):(p.stockMom||0)):0;
    if(cart[rowId].qty>=storeStock){toast("❌ เกินสต็อกของร้านนี้ ("+storeStock+" ต้น)");return;}
  }
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
  const ch=document.getElementById("cart-count-handle");
  if(ch)ch.textContent=count?`· ${count} รายการ`:"";
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
  const isMom=selectedSaleStore==="mom";
  el.innerHTML=
    `<div style="font-size:12px;color:var(--m);font-weight:600;margin-bottom:5px">
      แบ่ง % กำไรต่อรายการ
      ${isMom?`<span style="color:#FFB0CC;font-weight:700"> — ร้านแม่: ฟ้าไม่ได้% ทุกรายการ</span>`:`<span style="font-weight:400">(🩵 Fah ได้กี่ %)</span>`}
    </div>`+
    items.map(x=>{
      // ร้านแม่ → fahPct = 0 เสมอ; ร้านฟ้า → ใช้ค่า default หรือที่ผู้ใช้เปลี่ยน
      const fahPct=isMom?0:(payItemSplits[x.row]??x.defaultPct??50);
      payItemSplits[x.row]=fahPct;
      const momPct=100-fahPct;
      const rev=getItemPrice(x)*x.qty;
      const thumb=x.imgUrl?`<img src="${x.imgUrl}" style="width:20px;height:20px;object-fit:cover;border-radius:4px">`:x.emoji;
      if(isMom){
        // ร้านแม่: แสดงแบบ read-only ไม่มี input
        return`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--bd)">
          <span style="font-size:15px;flex-shrink:0">${thumb}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:var(--t);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.name}${x.lot?" ("+x.lot+")":""}</div>
            <div style="font-size:10px;color:var(--m)">฿${rev.toLocaleString()} · <span style="color:#FFB0CC">🩷 แม่ได้ทั้งหมด ฿${rev.toLocaleString()}</span></div>
          </div>
          <span style="font-size:11px;font-weight:700;color:#FFB0CC">แม่ 100%</span>
        </div>`;
      }
      return`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--bd)">
        <span style="font-size:15px;flex-shrink:0">${thumb}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--t);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.name}${x.lot?" ("+x.lot+")":""}</div>
          <div style="font-size:10px;color:var(--m)">฿${rev.toLocaleString()} · <span style="color:var(--g7)">🩵 ฿${Math.round(rev*fahPct/100).toLocaleString()}</span> / <span style="color:#FFB0CC">🩷 ฿${Math.round(rev*momPct/100).toLocaleString()}</span></div>
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
    if(info)info.innerHTML=`฿${rev.toLocaleString()} · <span style="color:var(--g7)">🩵 ฿${Math.round(rev*v/100).toLocaleString()}</span> / <span style="color:#FFB0CC">🩷 ฿${Math.round(rev*(100-v)/100).toLocaleString()}</span>`;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PAYMENT  — openPay, confirmSale
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
// ── PAYMENT ───────────────────────────────────────────────
function openPay(){
  payItemSplits={};
  extraCosts=[];renderExtraCosts();
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
  // Header ชื่อร้านโดดเด่นด้านบน popup
  const isFah=selectedSaleStore==="fah";
  const storeName=isFah?"🩵 ร้านฟ้า":"🩷 ร้านแม่";
  const storeColor=isFah?"#88DBBD":"#FFB0CC";
  const hdr=document.getElementById("pay-store-header");
  if(hdr){hdr.textContent=storeName;hdr.style.color=storeColor;}
  syncModalCustBtn();
  renderPayProfitSplits();
  document.getElementById("pay-overlay").classList.add("show");
  setTimeout(()=>document.getElementById("recv-inp").focus(),200);
}
function closePay(){document.getElementById("pay-overlay").classList.remove("show")}
function selectSaleStore(store,btn){
  selectedSaleStore=store;
  document.querySelectorAll("[id^='store-']").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  calcChange();
  // reset splits ทุกครั้งที่เปลี่ยนร้าน เพื่อ re-apply rule (แม่=0%, ฟ้า=defaultPct)
  payItemSplits={};
  renderPayProfitSplits();
}
function calcChange(){
  const recv=parseFloat(document.getElementById("recv-inp").value)||0;
  const total=getFinalTotal();
  const el=document.getElementById("change-box"),btn=document.getElementById("pay-ok");
  if(recv>=total){el.textContent="เงินทอน ฿"+(recv-total).toLocaleString();el.className="change-box change-ok";btn.disabled=false;}
  else if(recv>0){el.textContent="ขาดอีก ฿"+(total-recv).toLocaleString();el.className="change-box change-err";btn.disabled=true;}
  else{el.textContent="";el.className="change-box";btn.disabled=true;}
}

// ── PAYMENT CONFIRM (Optimistic + Offline Queue) ────────
async function confirmSale(){
  const items=Object.values(cart);
  const sub=getSubtotal(),disc=getDiscount(),total=getFinalTotal();
  const now=new Date();
  const btn=document.getElementById("pay-ok");
  btn.disabled=true;btn.textContent="กำลังบันทึก...";

  // ── เตรียมข้อมูล ──
  const fPct=payItemSplits;
  const pad=n=>String(n).padStart(2,"0");
  const dateStr=now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate())+"T"+pad(now.getHours())+":"+pad(now.getMinutes());
  const custName=selectedCust?selectedCust.name:"";
  const itemStr=items.map(x=>{
    const fahPct=fPct[x.row]!==undefined?fPct[x.row]:(x.defaultPct??50);
    return x.name+(x.lot?"("+x.lot+")":"")+"×"+x.qty+"×"+getItemPrice(x)+"×"+fahPct;
  }).join(", ");

  // ── 1. อัปเดต in-memory ทันที (ไม่รอ network) ──
  let negativeWarn=false;
  for(const x of items){
    const p=products.find(q=>q.row===x.row);
    if(p){
      p.stock-=x.qty;
      if(selectedSaleStore==="fah") p.stockFah=Math.max(0,(p.stockFah||0)-x.qty);
      else if(selectedSaleStore==="mom") p.stockMom=Math.max(0,(p.stockMom||0)-x.qty);
      if(p.stock<0) negativeWarn=true;
    }
  }
  let custEarned=0,savedCust=null;
  if(selectedCust){
    custEarned=Math.floor(total/10);
    const newPts=selectedCust.points+custEarned;
    const newSpent=(selectedCust.totalSpent||0)+total;
    const c=customers.find(q=>q.row===selectedCust.row);
    if(c){c.points=newPts;c.totalSpent=newSpent;}
    savedCust={...selectedCust,newPts,newSpent};
  }
  sales.unshift({
    date:now,
    items:items.map(x=>({name:x.name,emoji:x.emoji,lot:x.lot,price:getItemPrice(x),qty:x.qty,
      fahPct:fPct[x.row]!==undefined?fPct[x.row]:(x.defaultPct??50)})),
    subtotal:sub,discount:disc,total,custName,
    itemCount:items.reduce((s,x)=>s+x.qty,0),extraCosts:[...extraCosts]
  });

  // ── 2. แสดง UI + ใบเสร็จทันที ──
  clearSelectedCust();
  cart={};document.getElementById("disc-val").value="0";
  selectedSaleStore=null;
  delete document.documentElement.dataset.store;
  document.querySelectorAll("[id^='pos-fah'],[id^='pos-mom'],[id^='store-']").forEach(b=>b.classList.remove("active"));
  renderCart();renderProds();renderProdList();closePay();
  openReceipt(sales[0]);
  btn.disabled=false;btn.textContent="ยืนยันการขาย";
  if(savedCust) toast("✅ "+savedCust.name+" +"+custEarned+" แต้ม!");
  if(negativeWarn) toast("⚠️ สต็อกหน้าร้านติดลบ กรุณาตรวจสอบ/ย้ายสต็อก");

  // ── 3. Queue operations → sync to Google Sheet ──
  qEnqueue("addSale",{date:dateStr,items:itemStr,subtotal:sub,discount:disc,total,custName,extraCosts:JSON.stringify(extraCosts)});
  for(const x of items){
    const p=products.find(q=>q.row===x.row);
    if(p){
      qEnqueue("updateStock",{row:p.row,stock:p.stock});
      qEnqueue("updateStockLocations",{row:p.row,stockFah:p.stockFah||0,stockMom:p.stockMom||0});
    }
  }
  if(savedCust){
    qEnqueue("updateCustomer",{row:savedCust.row,name:savedCust.name,phone:savedCust.phone,
      points:savedCust.newPts,note:savedCust.note||"",totalSpent:savedCust.newSpent});
  }
  qFlush(); // background sync — ไม่ await
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
function updateStockBreakdownHint(autoFillTotal=false){
  const hint=document.getElementById("stock-breakdown-hint");
  if(!hint)return;
  const stockEl=document.getElementById("f-stock");
  const fah=parseInt(document.getElementById("f-stock-fah").value)||0;
  const mom=parseInt(document.getElementById("f-stock-mom").value)||0;
  const currentTotal=parseInt(stockEl.value)||0;
  // auto-fill ยอดรวม ถ้า caller เป็น fah/mom input และ total ยังเป็น 0
  if(autoFillTotal && currentTotal===0 && (fah+mom)>0){
    stockEl.value=fah+mom;
  }
  const total=parseInt(stockEl.value)||0;
  const garden=total-fah-mom;
  if(garden<0){
    hint.textContent=`⚠️ ฟ้า+แม่ (${fah+mom}) เกินสต็อกรวม (${total}) อยู่ ${-garden} ต้น`;
    hint.style.color="var(--r6)";
  }else{
    hint.textContent=`🏡 เหลือในสวน: ${garden} ต้น`;
    hint.style.color="var(--faint)";
  }
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
      return`<div class="pcard mcard" data-row="${p.row}" style="cursor:default">
        <div class="drag-handle" title="ลากเพื่อจัดเรียง"><i class="ti ti-grip-vertical"></i></div>
        ${imgHtml}
        <div style="font-size:12px;font-weight:600;color:var(--t);line-height:1.3">${name}${p.lot?`<div style="font-size:10px;font-weight:400;color:var(--m);margin-top:1px">${p.lot}</div>`:""}</div>
        <div style="font-size:13px;color:var(--g7);font-weight:600;margin-top:2px">฿${p.price.toLocaleString()}</div>
        <div style="font-size:10px;color:${p.stock<=0?"var(--r6)":p.stock<=5?"var(--a6)":"var(--faint)"};margin-top:2px">${p.stock<=0?"หมดแล้ว":"คงเหลือ "+p.stock+" ต้น"}</div>
        <div style="font-size:10px;color:var(--m);margin-top:3px;line-height:1.5">🏡สวน ${garden} · 🔵ฟ้า ${fah} · 🟢แม่ ${mom}</div>
        <span class="pbadge" style="background:var(--g1);color:var(--g8);font-size:10px">Fah ${p.defaultPct??50}%</span>
        ${p.cost>0?`<span class="pbadge" style="background:rgba(255,176,204,0.15);color:rgba(255,176,204,0.9);font-size:10px">ต้นทุน ฿${p.cost.toLocaleString()}</span>`:""}
        <div class="mcard-actions">
          <button class="mcard-btn" onclick="openTransferModal(${p.row})" title="ย้ายสต็อก"><i class="ti ti-arrows-exchange"></i></button>
          <button class="mcard-btn" onclick="openProductForm(${p.row})"><i class="ti ti-edit"></i></button>
          <button class="mcard-btn del" onclick="openDelModal(${p.row})"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
    }).join("");
    return headerHtml+cards;
  }).join("");
  initSortableProdList();
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DRAG-TO-REORDER — SortableJS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let _sortGrid=null, _sortList=null;

function initSortableGrid(){
  if(!window.Sortable)return;
  const el=document.getElementById("prod-grid");
  if(!el)return;
  if(_sortGrid)_sortGrid.destroy();
  _sortGrid=Sortable.create(el,{
    animation:200,
    delay:350,            // long-press บนมือถือ (ms)
    delayOnTouchOnly:true,
    ghostClass:"sort-ghost",
    chosenClass:"sort-chosen",
    dragClass:"sort-drag",
    filter:".pcard-empty",  // ไม่ drag การ์ดหมดสต็อก
    onChoose:()=>navigator.vibrate&&navigator.vibrate(20),
    onEnd:()=>saveSortOrder("grid")
  });
}

function initSortableProdList(){
  if(!window.Sortable)return;
  const el=document.getElementById("prod-list");
  if(!el)return;
  if(_sortList)_sortList.destroy();
  _sortList=Sortable.create(el,{
    animation:200,
    handle:".drag-handle",  // ลากผ่าน handle icon เท่านั้น
    ghostClass:"sort-ghost",
    chosenClass:"sort-chosen",
    dragClass:"sort-drag",
    filter:".prod-cat-hdr,.prod-group-header", // ไม่ drag header group
    onEnd:()=>saveSortOrder("list")
  });
}

async function saveSortOrder(source){
  const order=[];
  if(source==="grid"){
    // POS grid: card = representative ของ group
    // → เรียงลำดับทุก lot ของ group ตาม group order ใหม่
    const cards=[...document.querySelectorAll("#prod-grid [data-row]")];
    let pos=0;
    cards.forEach(card=>{
      const row=parseInt(card.dataset.row);
      const rep=products.find(p=>p.row===row);
      if(!rep)return;
      // lot ทั้งหมดของ group นี้ได้ sortOrder ต่อเนื่อง
      products.filter(p=>p.name===rep.name).forEach(lot=>{
        lot.sortOrder=pos;
        order.push({row:lot.row,pos:pos++});
      });
    });
    // เรียง products array ใหม่ให้ตรง (prevents snap-back on re-render)
    products.sort((a,b)=>a.sortOrder-b.sortOrder);
  } else {
    // Management list: individual lot cards
    const cards=[...document.querySelectorAll("#prod-list [data-row]")];
    cards.forEach((card,i)=>{
      const row=parseInt(card.dataset.row);
      const p=products.find(x=>x.row===row);
      if(p){p.sortOrder=i;order.push({row,pos:i});}
    });
    products.sort((a,b)=>a.sortOrder-b.sortOrder);
  }
  if(!order.length)return;
  try{
    await scriptPost({action:"updateSortOrder",order});
    toast("✅ บันทึกลำดับแล้ว");
  }catch(e){toast("⚠️ บันทึกลำดับไม่ได้: "+e.message);}
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
  document.getElementById("f-cost").value=p?.cost||0;
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
  if(ex){
    document.getElementById("f-price").value=ex.price||"";
    document.getElementById("f-cost").value=ex.cost||0;
    // inherit emoji จาก lot เดิม
    document.getElementById("f-emoji").value=ex.emoji||"🌿";
    buildEmojiGrid(ex.emoji||"🌿");
    const dpct2=ex.defaultPct??50;
    const el2=document.getElementById("f-default-pct");if(el2)el2.value=dpct2;
    syncDefaultPctBtns(dpct2);
  }
}
function closeProdForm(){document.getElementById("prod-overlay").classList.remove("show")}

async function saveProduct(){
  const name=document.getElementById("f-name").value.trim();
  const lot=document.getElementById("f-lot").value.trim();
  const existingP=editingProductId!==null?products.find(p=>p.row===editingProductId):products.find(p=>p.name===name);
  const cat=existingP?.cat||"";
  const price=parseFloat(document.getElementById("f-price").value)||0;
  const cost=parseFloat(document.getElementById("f-cost").value)||0;
  const stock=parseInt(document.getElementById("f-stock").value)||0;
  const stockFah=parseInt(document.getElementById("f-stock-fah").value)||0;
  const stockMom=parseInt(document.getElementById("f-stock-mom").value)||0;
  const emoji=document.getElementById("f-emoji").value.trim()||"🌿";
  const imgUrl=getImgForSave();
  let defaultPct=parseFloat(document.getElementById("f-default-pct").value);
  if(isNaN(defaultPct))defaultPct=50;
  defaultPct=Math.max(0,Math.min(100,defaultPct));
  if(!name){toast("❌ กรุณากรอกชื่อต้นไม้");return;}
  if(stockFah+stockMom>stock){
    toast(`❌ สต็อกหน้าร้าน (ฟ้า ${stockFah} + แม่ ${stockMom} = ${stockFah+stockMom}) เกินสต็อกรวม (${stock}) — แก้ให้รวมกันไม่เกินสต็อกรวมก่อนบันทึก`);
    return;
  }
  const btn=document.getElementById("prod-save-btn");
  btn.disabled=true;btn.textContent="กำลังบันทึก...";
  try{
    // ถ้ารูปเป็น base64 (อัปโหลดจากเครื่อง) → ส่งขึ้น Drive ก่อน ได้ URL กลับมาแทน
    let finalImgUrl=imgUrl;
    if(imgUrl.startsWith("data:")){
      btn.textContent="กำลังอัปโหลดรูป...";
      const r=await scriptPost({action:"uploadImage",imageBase64:imgUrl});
      finalImgUrl=r.url||"";
    }
    const savedImgUrl=finalImgUrl;
    if(editingProductId!==null){
      const row=editingProductId;
      await scriptPost({action:"updateProduct",row,name,lot,cat,price,cost,stock,emoji,imgUrl:savedImgUrl,defaultPct,stockFah,stockMom});
      const idx=products.findIndex(p=>p.row===row);
      if(idx>=0)products[idx]={...products[idx],name,lot,cat,price,cost,stock,emoji,imgUrl:savedImgUrl,defaultPct,stockFah,stockMom};
    }else{
      await scriptPost({action:"addProduct",name,lot,cat,price,cost,stock,emoji,imgUrl:savedImgUrl,defaultPct,stockFah,stockMom});
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
    // เลื่อน row ของสินค้าที่อยู่หลังแถวที่ลบ (Sheets เลื่อนขึ้น 1 แถว)
    products.forEach(p=>{if(p.row>row)p.row--;});
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
  // ต้นทุนรวม/กำไร — ตาม business rule: Fah100% → fahCost แยก, อื่นๆ → totalCost
  let totalCost=0,fahCostDash=0;
  ms.forEach(s=>s.items.forEach(it=>{
    const p=findProductForItem(it);
    const cost=(p?.cost||0)*it.qty;
    const fahPct=it.fahPct>=0?it.fahPct:50;
    if(fahPct===100) fahCostDash+=cost;
    else totalCost+=cost;
  }));
  const totalProfit=totalRev-totalCost-fahCostDash;
  document.getElementById("metric-grid").innerHTML=`
    <div class="metric"><div class="metric-lbl">ยอดรวม</div><div class="metric-val">฿${(totalRev/1000).toFixed(1)}k</div><div class="metric-sub ${pct>0?"up":pct<0?"down":"neu"}">${pct>0?"▲":pct<0?"▼":"–"} ${Math.abs(pct)}%</div></div>
    <div class="metric"><div class="metric-lbl">จำนวนบิล</div><div class="metric-val">${bills}</div><div class="metric-sub neu">เฉลี่ย ฿${avg.toLocaleString()}</div></div>
    <div class="metric"><div class="metric-lbl">ต้นไม้ที่ขาย</div><div class="metric-val">${totalItems}</div><div class="metric-sub neu">ต้น</div></div>
    <div class="metric"><div class="metric-lbl">ส่วนลดรวม</div><div class="metric-val">฿${Math.round(totalDisc).toLocaleString()}</div><div class="metric-sub neu">วันดี ${best?best[0]:"-"}</div></div>
    <div class="metric"><div class="metric-lbl">ต้นทุนรวม</div><div class="metric-val" style="font-size:17px">฿${Math.round(totalCost+fahCostDash).toLocaleString()}</div></div>
    <div class="metric"><div class="metric-lbl">กำไร</div><div class="metric-val" style="font-size:17px;color:${totalProfit>=0?"var(--g7)":"var(--r6)"}">฿${Math.round(totalProfit).toLocaleString()}</div></div>`;
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
  const cr=document.getElementById("profit-custom-range");
  if(preset==="custom"){
    if(cr)cr.style.display="flex";
    // อ่านค่าจาก input ถ้ามี
    const f=document.getElementById("profit-date-from")?.value;
    const t=document.getElementById("profit-date-to")?.value;
    if(f)profitFrom=new Date(f);
    if(t)profitTo=new Date(t);
  } else {
    if(cr)cr.style.display="none";
    if(preset==="today"){profitFrom=profitTo=today;}
    else if(preset==="7d"){profitFrom=new Date(today-6*864e5);profitTo=today;}
    else if(preset==="30d"){profitFrom=new Date(today-29*864e5);profitTo=today;}
    else if(preset==="mtd"){profitFrom=new Date(now.getFullYear(),now.getMonth(),1);profitTo=today;}
    else if(preset==="1y"){profitFrom=new Date(now.getFullYear()-1,now.getMonth(),now.getDate());profitTo=today;}
  }
  renderProfit();
}
function renderProfit(){
  // ถ้าโหมดกำหนดเอง อ่านค่าจาก input ก่อนเสมอ
  if(document.getElementById("profit-custom-range")?.style.display==="flex"){
    const f=document.getElementById("profit-date-from")?.value;
    const t=document.getElementById("profit-date-to")?.value;
    if(f)profitFrom=new Date(f);
    if(t)profitTo=new Date(t);
  }
  const from=profitFrom||new Date(new Date().setHours(0,0,0,0));
  const toEnd=new Date(profitTo||from);toEnd.setHours(23,59,59,999);
  const ms=sales.filter(s=>{const d=new Date(s.date);return d>=from&&d<=toEnd;});

  // ━━ คำนวณยอด / กำไร / ต้นทุน ตาม business rule ━━
  // ร้านแม่ (fahPct=0):  ยอด→แม่, กำไร→แม่, ต้นทุน→แม่
  // ร้านฟ้า 100%:         ยอด→ฟ้า, กำไร→ฟ้า, ต้นทุน→ฟ้า
  // ร้านฟ้า X% (เช่น 50%): ยอด→ฟ้าทั้งหมด, กำไรหาร X%/(100-X%), ต้นทุน→รวมเท่านั้น
  let totalRev=0,fahTotal=0,momTotal=0,totalItems=0,totalDisc=0;
  let totalCost=0,fahCost=0,momCost=0,totalExtraCost=0;
  let fahProfit=0,momProfit=0;

  ms.forEach(s=>{
    totalRev+=s.total;
    totalDisc+=(s.discount||0);
    const sub=s.subtotal||0;
    const discRatio=sub>0?(s.discount||0)/sub:0;
    s.items.forEach(it=>{
      const p=findProductForItem(it);
      const cost=(p?.cost||0)*it.qty;
      const rev=it.qty*(it.price||0);
      const fahPct=it.fahPct>=0?it.fahPct:50;
      const net=rev*(1-discRatio);
      totalItems+=it.qty;
      if(fahPct===0){
        // ร้านแม่: ยอด/กำไร/ต้นทุน → แม่, cost รวมใน totalCost
        totalCost+=cost;
        momTotal+=net;
        momCost+=cost;
        momProfit+=net-cost;
      }else if(fahPct===100){
        // ร้านฟ้า Fah 100%: ต้นทุน → fahCost เท่านั้น ไม่รวม totalCost
        fahTotal+=net;
        fahCost+=cost;
        fahProfit+=net-cost;
      }else{
        // ร้านฟ้า Fah X%: ยอด→ฟ้า, กำไรหาร, ต้นทุน→ totalCost เท่านั้น
        totalCost+=cost;
        const fPct=fahPct/100;
        fahTotal+=net;
        fahProfit+=net*fPct;
        momProfit+=net*(1-fPct);
      }
    });
    totalExtraCost+=(s.extraCosts||[]).reduce((a,c)=>a+(c.amount||0),0);
  });

  const bills=ms.length;
  const avg=bills?Math.round(totalRev/bills):0;
  const netProfit=totalRev-totalCost-fahCost-totalExtraCost;

  document.getElementById("profit-metrics").innerHTML=`
    <div class="metric" data-accent="total"><div class="metric-lbl">ยอดขายรวม</div><div class="metric-val" style="font-size:17px">฿${Math.round(totalRev).toLocaleString()}</div></div>
    <div class="metric" data-accent="profit"><div class="metric-lbl">กำไรสุทธิ</div><div class="metric-val" style="font-size:17px;color:${netProfit>=0?"#F2C05A":"var(--r6)"}">฿${Math.round(netProfit).toLocaleString()}</div></div>
    <div class="metric" data-accent="mom"><div class="metric-lbl">🩷 กำไรแม่สุทธิ</div><div class="metric-val" style="font-size:17px;color:${momProfit>=0?"#FFB0CC":"var(--r6)"}">฿${Math.round(momProfit).toLocaleString()}</div></div>
    <div class="metric" data-accent="fah"><div class="metric-lbl">🩵 กำไรฟ้าสุทธิ</div><div class="metric-val" style="font-size:17px;color:${fahProfit>=0?"#88DBBD":"var(--r6)"}">฿${Math.round(fahProfit).toLocaleString()}</div></div>
    <div class="metric" data-accent="mom"><div class="metric-lbl">🩷 ยอดขายแม่รวม</div><div class="metric-val" style="font-size:17px;color:#FFB0CC">฿${Math.round(momTotal).toLocaleString()}</div></div>
    <div class="metric" data-accent="fah"><div class="metric-lbl">🩵 ยอดขายฟ้ารวม</div><div class="metric-val" style="font-size:17px;color:#88DBBD">฿${Math.round(fahTotal).toLocaleString()}</div></div>
    <div class="metric" data-accent="total"><div class="metric-lbl">ต้นทุนรวม</div><div class="metric-val" style="font-size:17px">฿${Math.round(totalCost).toLocaleString()}</div></div>
    <div class="metric" data-accent="fah"><div class="metric-lbl">💰 ต้นทุนฟ้า <span style="font-weight:400;font-size:10px;opacity:.6">(Fah 100%)</span></div><div class="metric-val" style="font-size:17px">฿${Math.round(fahCost).toLocaleString()}</div></div>
    <div class="metric-quad">
      <div class="metric" data-accent="total"><div class="metric-lbl">ต้นไม้ที่ขาย</div><div class="metric-val">${totalItems}</div><div class="metric-sub neu">ต้น</div></div>
      <div class="metric" data-accent="total"><div class="metric-lbl">จำนวนบิล</div><div class="metric-val">${bills}</div><div class="metric-sub neu">บิล</div></div>
      <div class="metric" data-accent="total"><div class="metric-lbl">ส่วนลดรวม</div><div class="metric-val" style="font-size:15px">฿${Math.round(totalDisc).toLocaleString()}</div></div>
      <div class="metric" data-accent="total"><div class="metric-lbl">📦 ต้นทุนอื่นๆ</div><div class="metric-val" style="font-size:15px;color:rgba(255,176,204,0.85)">฿${Math.round(totalExtraCost).toLocaleString()}</div></div>
    </div>`;

  // Breakdown by item name
  const byName={};
  ms.forEach(s=>{
    const sub=s.subtotal||0;
    const discRatio=sub>0?(s.discount||0)/sub:0;
    s.items.forEach(it=>{
      const k=it.name;
      if(!byName[k])byName[k]={name:k,emoji:it.emoji||"🌿",qty:0,rev:0,fahRev:0,momRev:0,cost:0};
      const rev=it.qty*(it.price||0);
      const net=rev*(1-discRatio);
      const fahPct=it.fahPct>=0?it.fahPct:50;
      const p=findProductForItem(it);
      const cost=(p?.cost||0)*it.qty;
      byName[k].qty+=it.qty;byName[k].rev+=rev;
      // ตาม business rule
      if(fahPct===0){byName[k].momRev+=net;}
      else if(fahPct===100){byName[k].fahRev+=net;byName[k].cost+=cost;}
      else{byName[k].fahRev+=net;/* ยอดเต็มเป็นฟ้า */byName[k].cost+=cost;}
    });
  });
  const sorted=Object.values(byName).sort((a,b)=>b.rev-a.rev);

  document.getElementById("profit-breakdown").innerHTML=`
    <div class="profit-block">
      <div class="profit-block-title"><i class="ti ti-calculator" style="color:var(--g7);font-size:18px"></i> สรุปกำไร</div>
      <div class="profit-line" data-accent="total"><span class="p-lbl">ยอดขายรวม</span><span class="p-val">฿${Math.round(totalRev).toLocaleString()}</span></div>
      <div class="profit-line" data-accent="fah"><span class="p-lbl">🩵 Fah ได้</span><span class="p-val pv-ts">฿${Math.round(fahTotal).toLocaleString()}</span></div>
      <div class="profit-line" data-accent="mom"><span class="p-lbl">🩷 แม่ได้</span><span class="p-val pv-snp">฿${Math.round(momTotal).toLocaleString()}</span></div>
      <div class="profit-line" data-accent="total"><span class="p-lbl">ต้นทุนรวม</span><span class="p-val">฿${Math.round(totalCost).toLocaleString()}</span></div>
      <div class="profit-line" data-accent="total"><span class="p-lbl">📦 ต้นทุนอื่นๆ</span><span class="p-val" style="color:rgba(255,176,204,0.85)">฿${Math.round(totalExtraCost).toLocaleString()}</span></div>
      <div class="profit-line" data-accent="profit"><span class="p-lbl">กำไรสุทธิ</span><span class="p-val" style="color:${netProfit>=0?"#F2C05A":"var(--r6)"}">฿${Math.round(netProfit).toLocaleString()}</span></div>
    </div>
    ${sorted.length?`<div class="profit-block">
      <div class="profit-block-title"><i class="ti ti-list" style="color:var(--m);font-size:16px"></i> แยกตามสินค้า</div>
      ${sorted.map(x=>{
        const itemProfit=x.rev-x.cost;
        return`
        <div class="profit-line">
          <span class="p-lbl">${x.emoji} ${x.name} <span style="font-size:10px;color:var(--faint)">${x.qty} ต้น</span></span>
          <div style="text-align:right">
            <div class="p-val" style="font-size:12px">฿${Math.round(x.rev).toLocaleString()}</div>
            <div style="font-size:10px"><span style="color:#88DBBD">🩵฿${Math.round(x.fahRev).toLocaleString()}</span> / <span style="color:#FFB0CC">🩷฿${Math.round(x.momRev).toLocaleString()}</span></div>
            <div style="font-size:10px;color:var(--m)">ต้นทุน ฿${Math.round(x.cost).toLocaleString()} · กำไร <span style="color:${itemProfit>=0?"#88DBBD":"var(--r6)"}">฿${Math.round(itemProfit).toLocaleString()}</span></div>
          </div>
        </div>`}).join("")}
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
  let lastDateKey="";
  hl.innerHTML=sales.slice(0,50).map((s,i)=>{
    const d=new Date(s.date);
    const dateKey=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const dateLabel=`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()+543}`;
    const divider=dateKey!==lastDateKey?`<div class="date-divider"><span>${dateLabel}</span></div>`:"";
    lastDateKey=dateKey;
    const ds=`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    const discTxt=s.discount>0?` ส่วนลด −฿${s.discount.toLocaleString()}`:"";
    return divider+`<div class="sale-card">
      <div class="sale-hdr"><span class="sale-date"><i class="ti ti-clock" style="font-size:10px"></i> ${ds}</span><span class="sale-badge">${s.itemCount} รายการ</span></div>
      <div class="sale-items-txt">${s.custName?`👤 ${s.custName} · `:""}${s.items.map(x=>`${x.emoji||"🌿"}${x.name}×${x.qty}`).join(" · ")}${discTxt?` · ${discTxt}`:""}</div>
      <div class="sale-foot">
        <div class="sale-total">฿${Math.round(s.total).toLocaleString()}</div>
        <div style="display:flex;gap:5px">
          <button class="sale-print-btn" onclick="openReceipt(sales[${i}])" title="ออกบิล / พิมพ์"><i class="ti ti-printer"></i></button>
          <button class="sale-print-btn" onclick="openSaleEdit(${i})" title="แก้ไข" style="color:var(--g7)"><i class="ti ti-edit"></i></button>
          <button class="sale-print-btn" onclick="openSaleDel(${i})" title="ลบ" style="color:var(--r6)"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`}).join("");
}

/* ── แก้ไขประวัติการขาย ─── */
function openSaleEdit(idx){
  editingSaleIdx=idx;
  const s=sales[idx];
  if(!s)return;
  document.getElementById("se-cust").value=s.custName||"";
  document.getElementById("se-discount").value=s.discount||0;
  document.getElementById("sale-edit-items").innerHTML=
    s.items.map(x=>`${x.emoji||"🌿"} ${x.name}${x.lot?" ("+x.lot+")":""} ×${x.qty} · ฿${(x.price*x.qty).toLocaleString()}`).join("<br>");
  document.getElementById("sale-edit-overlay").classList.add("show");
}
function closeSaleEdit(){document.getElementById("sale-edit-overlay").classList.remove("show");editingSaleIdx=null;}
async function saveSaleEdit(){
  const s=sales[editingSaleIdx];
  if(!s)return closeSaleEdit();
  const newDiscount=parseFloat(document.getElementById("se-discount").value)||0;
  const newCust=document.getElementById("se-cust").value.trim();
  const newTotal=Math.max(0,(s.subtotal||0)-newDiscount);
  try{
    await scriptPost({action:"editSale",sheetRow:s.sheetRow,discount:newDiscount,custName:newCust,total:newTotal});
    s.discount=newDiscount;s.custName=newCust;s.total=newTotal;
    closeSaleEdit();renderHistory();renderProfit();
    toast("✅ แก้ไขแล้ว");
  }catch(e){toast("❌ "+e.message);}
}

/* ── ลบประวัติการขาย ─── */
function openSaleDel(idx){
  deletingSaleIdx=idx;
  const s=sales[idx];
  if(!s)return;
  const d=new Date(s.date);
  const ds=`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  document.getElementById("sale-del-info").innerHTML=
    `<b>${ds}</b><br>${s.items.map(x=>`${x.emoji||"🌿"} ${x.name} ×${x.qty}`).join(" · ")}<br>ยอด ฿${Math.round(s.total).toLocaleString()}`;
  document.getElementById("sale-del-overlay").classList.add("show");
}
function closeSaleDel(){document.getElementById("sale-del-overlay").classList.remove("show");deletingSaleIdx=null;}
async function confirmDeleteSale(){
  const s=sales[deletingSaleIdx];
  if(!s)return closeSaleDel();
  if(!s.sheetRow){
    // sheetRow ยังไม่ได้ sync — reload ก่อนแล้วลบ
    await loadSales();
    const updated=sales[deletingSaleIdx];
    if(!updated?.sheetRow){sales.splice(deletingSaleIdx,1);closeSaleDel();renderHistory();renderProfit();toast("🗑 ลบแล้ว (local)");return;}
    deletingSaleIdx=sales.indexOf(updated);
  }
  try{
    await scriptPost({action:"deleteSaleByRow",sheetRow:s.sheetRow});
    sales.splice(deletingSaleIdx,1);
    // adjust sheetRow ของแถวที่อยู่หลัง (ทุกแถวถัดไปเลื่อนขึ้น 1)
    sales.forEach(x=>{if(x.sheetRow>s.sheetRow)x.sheetRow--;});
    closeSaleDel();renderHistory();renderProfit();
    toast("🗑 ลบแล้ว");
  }catch(e){toast("❌ "+e.message);}
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
  // หน้าอื่นนอก POS ใช้ white theme เสมอ
  if(name!=="pos"){
    delete document.documentElement.dataset.store;
    closeTopbarSearch();
  } else if(selectedSaleStore){
    document.documentElement.dataset.store=selectedSaleStore;
  }
  if(name==="report"){
    renderHistory();
    if(!profitFrom)setProfitPreset("today",document.querySelector("#profit-presets .preset-btn"));else renderProfit();
  }
  if(name==="manage")renderProdList();
  if(name==="customers")renderCustList();
}

function toggleCart(){
  document.querySelector(".cart-panel").classList.toggle("cart-collapsed");
}

function toggleTopbarSearch(){
  const inp=document.getElementById("topbar-search-input");
  const brand=document.getElementById("topbar-brand");
  const btnI=document.querySelector("#topbar-search-btn i");
  const open=inp.style.display==="block"||inp.style.display==="flex";
  if(open){
    inp.style.display="none"; inp.value="";
    brand.style.display=""; if(btnI)btnI.className="ti ti-search";
    renderProds();
  } else {
    inp.style.display="block";
    brand.style.display="none"; if(btnI)btnI.className="ti ti-x";
    inp.focus();
  }
}

function closeTopbarSearch(){
  const inp=document.getElementById("topbar-search-input");
  const brand=document.getElementById("topbar-brand");
  const btnI=document.querySelector("#topbar-search-btn i");
  if(!inp)return;
  inp.style.display="none"; inp.value="";
  brand.style.display=""; if(btnI)btnI.className="ti ti-search";
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   EXTRA COSTS  — ต้นทุนอื่นๆ ในหน้าชำระเงิน
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function getExtraCostTotal(){return extraCosts.reduce((s,c)=>s+(c.amount||0),0);}
function addExtraCost(label){
  extraCosts.push({label,amount:0});
  renderExtraCosts();
}
function removeExtraCost(i){
  extraCosts.splice(i,1);
  renderExtraCosts();
}
function renderExtraCosts(){
  const el=document.getElementById("extra-costs-list");
  if(!el)return;
  el.innerHTML=extraCosts.map((c,i)=>`
    <div class="extra-cost-row">
      <span class="extra-cost-row-lbl">${c.label}</span>
      <input class="form-inp" type="number" inputmode="decimal" placeholder="0"
        value="${c.amount||""}" style="width:110px;padding:6px 8px;font-size:14px"
        oninput="extraCosts[${i}].amount=parseFloat(this.value)||0">
      <button class="extra-cost-remove" onclick="removeExtraCost(${i})"><i class="ti ti-x" style="font-size:12px"></i></button>
    </div>`).join("");
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CART SWIPE  — ปัดลงเพื่อซ่อนตะกร้า
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function initCartSwipe(){
  const handle=document.getElementById("cart-drag-handle");
  if(!handle)return;
  let startY=0;
  handle.addEventListener("touchstart",e=>{startY=e.touches[0].clientY;},{passive:true});
  handle.addEventListener("touchend",e=>{
    const dy=e.changedTouches[0].clientY-startY;
    const panel=document.querySelector(".cart-panel");
    if(dy>50) panel.classList.add("cart-collapsed");
    else if(dy<-50) panel.classList.remove("cart-collapsed");
  },{passive:true});
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
(async()=>{renderProds();await syncAll();initSheetSwipe();initCartSwipe();})();

