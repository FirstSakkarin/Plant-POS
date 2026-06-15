/* ════════════════════════════════════════════════════════════
   TreeSiri POS — Google Apps Script (Code.gs)
   ═══════════════════════════════════════════════════════════
   ⚠️ หมายเหตุสำคัญ:
   ผมไม่มีโค้ด Apps Script ต้นฉบับของคุณ (ไฟล์นี้ไม่ได้อยู่ใน repo และผมเข้า
   Apps Script editor ของคุณไม่ได้) ไฟล์นี้คือ "เขียนใหม่ทั้งหมด" โดยอ้างอิงจาก
   ทุก action ที่ app.js เรียกใช้จริง (ดูจาก scriptPost ในไฟล์ app.js)
   ครอบคลุม: addSale, updateStock, updateStockLocations, updateProduct,
   addProduct, deleteProduct, updateCustomer, addCustomer

   ก่อนใช้:
   1. เปิด Apps Script editor (ไอคอน Extensions → Apps Script)
   2. ถ้ามีโค้ดเดิมอยู่ — กด Ctrl+A คัดลอกสำรองเก็บไว้ก่อน (เผื่อมี logic พิเศษ
      ที่ทำไว้ เช่น แต้มสะสม / ส่วนลดสมาชิก ที่ไฟล์นี้อาจไม่ครอบคลุม)
   3. ลบโค้ดเดิม วางไฟล์นี้แทนทั้งหมด
   4. แก้ SHEET_ID ด้านล่างให้ตรงกับของคุณ (ตัวเดียวกับใน app.js)
   5. ตรวจสอบว่าชีต "Products" มีคอลัมน์ A-J ครบ:
        A name, B lot, C cat, D price, E stock, F emoji, G imgUrl,
        H defaultPct, I stockFah, J stockMom
      (ถ้ายังไม่มี I, J ให้เพิ่มหัวคอลัมน์เปล่าๆไว้)
   6. Deploy → Manage deployments → ✏️ แก้ไข → Version: New → Deploy
      (ใช้ URL เดิมได้ ไม่ต้องเปลี่ยน SCRIPT_URL ใน app.js)
   ═══════════════════════════════════════════════════════════ */

const SHEET_ID = "1c_t89oC0p5setOKKu2vuPbkVb_NXPCJ8jh_O9pP4s-o"; // ⚠️ ตรวจสอบให้ตรงกับ SHEET_ID ใน app.js

function doPost(e) {
  let result;
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);

    switch (data.action) {
      case "addSale":         result = addSale(ss, data); break;
      case "updateStock":     result = updateStock(ss, data); break;
      case "updateStockLocations": result = updateStockLocations(ss, data); break;
      case "addProduct":      result = addProduct(ss, data); break;
      case "updateProduct":   result = updateProduct(ss, data); break;
      case "deleteProduct":   result = deleteProduct(ss, data); break;
      case "addCustomer":     result = addCustomer(ss, data); break;
      case "updateCustomer":  result = updateCustomer(ss, data); break;
      default:
        return jsonOut({ ok: false, error: "Unknown action: " + data.action });
    }
    return jsonOut({ ok: true, ...result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────────────────────────────
   PRODUCTS  (ชีต "Products", คอลัมน์ A-J)
   A name | B lot | C cat | D price | E stock | F emoji
   G imgUrl | H defaultPct | I stockFah | J stockMom
─────────────────────────────────────────────── */
function addProduct(ss, p) {
  const sheet = ss.getSheetByName("Products");
  sheet.appendRow([
    p.name || "", p.lot || "", p.cat || "",
    p.price || 0, p.stock || 0,
    p.emoji || "🌿", p.imgUrl || "",
    p.defaultPct ?? 50,
    p.stockFah || 0,
    p.stockMom || 0
  ]);
  return {};
}

function updateProduct(ss, p) {
  const sheet = ss.getSheetByName("Products");
  const row = parseInt(p.row);
  sheet.getRange(row, 1, 1, 8).setValues([[
    p.name || "", p.lot || "", p.cat || "",
    p.price || 0, p.stock || 0,
    p.emoji || "🌿", p.imgUrl || "",
    p.defaultPct ?? 50
  ]]);
  sheet.getRange(row, 9).setValue(p.stockFah || 0);   // I
  sheet.getRange(row, 10).setValue(p.stockMom || 0);  // J
  return {};
}

function deleteProduct(ss, p) {
  const sheet = ss.getSheetByName("Products");
  sheet.deleteRow(parseInt(p.row));
  return {};
}

// ตัดสต็อกรวม (คอลัมน์ E) — เรียกตอนยืนยันการขาย
function updateStock(ss, p) {
  const sheet = ss.getSheetByName("Products");
  sheet.getRange(parseInt(p.row), 5).setValue(p.stock || 0); // E
  return {};
}

// อัปเดตสต็อกหน้าร้านฟ้า/แม่ (คอลัมน์ I, J) — เรียกตอนย้ายสต็อก หรือขายแล้วตัดยอดหน้าร้าน
function updateStockLocations(ss, p) {
  const sheet = ss.getSheetByName("Products");
  const row = parseInt(p.row);
  sheet.getRange(row, 9).setValue(p.stockFah || 0);   // I
  sheet.getRange(row, 10).setValue(p.stockMom || 0);  // J
  return {};
}

/* ───────────────────────────────────────────────
   SALES  (ชีต "Sales", คอลัมน์ A-F)
   A date | B items | C subtotal | D discount | E total | F custName
─────────────────────────────────────────────── */
function addSale(ss, s) {
  const sheet = ss.getSheetByName("Sales");
  sheet.appendRow([
    s.date || "",
    s.items || "",
    s.subtotal || 0,
    s.discount || 0,
    s.total || 0,
    s.custName || ""
  ]);
  return {};
}

/* ───────────────────────────────────────────────
   CUSTOMERS  (ชีต "Customers", คอลัมน์ A-E)
   A name | B phone | C points | D note | E totalSpent
─────────────────────────────────────────────── */
function addCustomer(ss, c) {
  const sheet = ss.getSheetByName("Customers");
  sheet.appendRow([
    c.name || "", c.phone || "",
    c.points || 0, c.note || "",
    c.totalSpent || 0
  ]);
  return {};
}

function updateCustomer(ss, c) {
  const sheet = ss.getSheetByName("Customers");
  const row = parseInt(c.row);
  sheet.getRange(row, 1, 1, 5).setValues([[
    c.name || "", c.phone || "",
    c.points || 0, c.note || "",
    c.totalSpent || 0
  ]]);
  return {};
}
