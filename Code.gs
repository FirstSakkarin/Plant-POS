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
      case "addCustomer":       result = addCustomer(ss, data); break;
      case "updateCustomer":    result = updateCustomer(ss, data); break;
      case "deleteSaleByRow":   result = deleteSaleByRow(ss, data); break;
      case "editSale":          result = editSale(ss, data); break;
      case "updateSortOrder":   result = updateSortOrder(ss, data); break;
      case "uploadImage":       result = uploadImage(data); break;
      case "rebuildSummary":    result = (updateSummary(ss), {}); break;
      case "addExpense":        result = addExpense(ss, data); break;
      case "deleteExpenseByRow": result = deleteExpenseByRow(ss, data); break;
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
   PRODUCTS  (ชีต "Products", คอลัมน์ A-L)
   A sortOrder | B ชื่อ | C lots | D ราคาต้นทุน | E ราคา | F สต็อกรวม
   G สต็อกฟ้า | H สต็อกแม่ | I emoji | J imgUrl | K %ฟ้า | L ต้นทุนของใคร
─────────────────────────────────────────────── */
function addProduct(ss, p) {
  const sheet = ss.getSheetByName("Products");
  sheet.appendRow([
    p.sortOrder || 0,
    p.name || "", p.lot || "",
    p.cost || 0, p.price || 0, p.stock || 0,
    p.stockFah || 0, p.stockMom || 0,
    p.emoji || "🌿", p.imgUrl || "",
    p.defaultPct ?? 50,
    p.costOwner || "แม่"
  ]);
  return {};
}

function updateProduct(ss, p) {
  const sheet = ss.getSheetByName("Products");
  const row = parseInt(p.row);
  if (!row || row < 2) throw new Error("Invalid row: " + p.row);
  // คอลัมน์ B-L (ข้ามคอลัมน์ A=sortOrder ซึ่งจัดการแยกโดย updateSortOrder)
  sheet.getRange(row, 2, 1, 11).setValues([[
    p.name || "", p.lot || "",
    p.cost || 0, p.price || 0, p.stock || 0,
    p.stockFah || 0, p.stockMom || 0,
    p.emoji || "🌿", p.imgUrl || "",
    p.defaultPct ?? 50,
    p.costOwner || "แม่"
  ]]);
  return {};
}

function deleteProduct(ss, p) {
  const sheet = ss.getSheetByName("Products");
  const row = parseInt(p.row);
  if (!row || row < 2) throw new Error("Invalid row: " + p.row);
  sheet.deleteRow(row);
  return {};
}

// ตัดสต็อกรวม (คอลัมน์ F) — เรียกตอนยืนยันการขาย
function updateStock(ss, p) {
  const sheet = ss.getSheetByName("Products");
  const row = parseInt(p.row);
  if (!row || row < 2) throw new Error("Invalid row: " + p.row);
  sheet.getRange(row, 6).setValue(p.stock || 0); // F
  return {};
}

// อัปเดตสต็อกหน้าร้านฟ้า/แม่ (คอลัมน์ G, H) — เรียกตอนย้ายสต็อก หรือขายแล้วตัดยอดหน้าร้าน
function updateStockLocations(ss, p) {
  const sheet = ss.getSheetByName("Products");
  const row = parseInt(p.row);
  if (!row || row < 2) throw new Error("Invalid row: " + p.row);
  sheet.getRange(row, 7).setValue(p.stockFah || 0);   // G
  sheet.getRange(row, 8).setValue(p.stockMom || 0);   // H
  return {};
}

/* ───────────────────────────────────────────────
   SALES  (ชีต "Sales", คอลัมน์ A-L) — รูปแบบใหม่ 1 row/item
   A วันที่ | B billId | C ชื่อสินค้า | D จำนวน | E ราคา/หน่วย
   F %ฟ้า | G ร้าน | H prodRow | I ส่วนลด | J ยอดสุทธิ | K ลูกค้า | L ต้นทุนอื่นๆ
   bill-level (I,J,K,L) เขียนที่แถวแรกของบิลเท่านั้น
─────────────────────────────────────────────── */
function addSale(ss, s) {
  const sheet = ss.getSheetByName("Sales");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // หา billId ถัดไป (เลขลำดับ 1, 2, 3...)
    // ทำภายใต้ lock เพื่อกัน billId ชนกันถ้ามีการขายพร้อมกันจากสองอุปกรณ์
    const lastRow = sheet.getLastRow();
    let billId = 1;
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues()
        .map(r => parseInt(r[0]) || 0).filter(n => n > 0);
      if (ids.length > 0) billId = Math.max(...ids) + 1;
    }

    // แยก items string: "name×qty×price×fahPct×store×prodRow, ..."
    const itemParts = (s.items || "").split(",").map(x => x.trim()).filter(x => x);

    itemParts.forEach((itemStr, idx) => {
      const p = itemStr.split("×");
      const name     = (p[0] || "").trim();
      const qtyNum   = parseInt(p[1]);
      const qty      = isNaN(qtyNum) ? 1 : qtyNum;
      const price    = parseFloat(p[2]) || 0;
      const fahPct   = parseFloat(p[3]) >= 0 ? parseFloat(p[3]) : 50;
      const store    = (p[4] || "").trim();
      const prodRow  = parseInt(p[5]) || "";

      sheet.appendRow([
        s.date || "",                               // A: วันที่
        billId,                                     // B: billId
        name,                                       // C: ชื่อสินค้า
        qty,                                        // D: จำนวน
        price,                                      // E: ราคา/หน่วย
        fahPct,                                     // F: %ฟ้า
        store,                                      // G: ร้าน
        prodRow,                                    // H: prodRow
        idx === 0 ? (parseFloat(s.discount) || 0) : "",  // I: ส่วนลด (row แรก)
        idx === 0 ? (parseFloat(s.total)    || 0) : "",  // J: ยอดสุทธิ (row แรก)
        idx === 0 ? (s.custName || "")             : "",  // K: ลูกค้า (row แรก)
        idx === 0 ? (s.extraCosts || "[]")         : ""   // L: ต้นทุนอื่นๆ (row แรก)
      ]);
    });

    updateSummary(ss);
    return {};
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────────────────────────────
   SUMMARY  (ชีต "สรุปผล") — อัปเดตอัตโนมัติทุกครั้งที่บันทึกขาย
   รูปแบบใหม่: A-L (1 row/item, group by billId)
─────────────────────────────────────────────── */
function updateSummary(ss) {
  const salesSheet = ss.getSheetByName("Sales");
  let sumSheet = ss.getSheetByName("สรุปผล");
  if (!sumSheet) sumSheet = ss.insertSheet("สรุปผล");
  sumSheet.clearContents().clearFormats();

  const data = salesSheet.getDataRange().getValues();
  if (data.length <= 1) return;

  // Pass 1: รวบรวม items ต่อ bill (group by billId = col B)
  const billItems = {};  // billId → [{qty, price, fahPct}]
  const billInfo  = {};  // billId → {dayKey, discount, total, custName}
  const billOrder = [];

  for (let i = 1; i < data.length; i++) {
    const row     = data[i];
    const rawDate = row[0];
    const billId  = String(row[1] || "").trim();
    if (!rawDate || !billId) continue;

    // แปลงวันที่เป็น key — รองรับทั้ง string และกรณี Sheets แปลง cell เป็น Date object เอง
    let dayKey = "";
    if (Object.prototype.toString.call(rawDate) === "[object Date]") {
      dayKey = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else {
      const dateStr = String(rawDate).trim();
      const iso = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
      const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (iso) dayKey = iso[1];
      else if (dmy) dayKey = dmy[3] + "-" + String(dmy[2]).padStart(2,"0") + "-" + String(dmy[1]).padStart(2,"0");
      else continue;
    }

    if (!billInfo[billId]) {
      billInfo[billId] = { dayKey, discount: 0, total: 0, custName: "" };
      billItems[billId] = [];
      billOrder.push(billId);
    }

    // bill-level info อยู่ที่แถวแรก (col I, J, K)
    if (row[8] !== "" && row[8] !== null && row[8] !== undefined)
      billInfo[billId].discount = parseFloat(row[8]) || 0;
    if (row[9] !== "" && row[9] !== null && row[9] !== undefined)
      billInfo[billId].total = parseFloat(row[9]) || 0;
    if (row[10]) billInfo[billId].custName = String(row[10]);

    // item-level info (col C-F)
    const qtyNum = parseInt(row[3]);
    billItems[billId].push({
      qty:    isNaN(qtyNum) ? 1 : qtyNum,
      price:  parseFloat(row[4]) || 0,
      fahPct: parseFloat(row[5]) >= 0 ? parseFloat(row[5]) : 50,
    });
  }

  // Pass 2: รวบรวมต่อวัน
  const byDay = {};
  billOrder.forEach(billId => {
    const info  = billInfo[billId];
    const items = billItems[billId];
    const subtotal  = items.reduce((s, it) => s + it.qty * it.price, 0);
    const discRatio = subtotal > 0 ? info.discount / subtotal : 0;

    let fahTotal = 0, momTotal = 0;
    items.forEach(it => {
      const net = it.qty * it.price * (1 - discRatio);
      const fahShare = net * (it.fahPct / 100);
      fahTotal += fahShare;
      momTotal += net - fahShare;
    });

    const day = info.dayKey;
    if (!byDay[day]) byDay[day] = {bills:0, subtotal:0, discount:0, total:0, fah:0, mom:0, custs:[]};
    byDay[day].bills++;
    byDay[day].subtotal += subtotal;
    byDay[day].discount += info.discount;
    byDay[day].total    += info.total;
    byDay[day].fah      += fahTotal;
    byDay[day].mom      += momTotal;
    if (info.custName) byDay[day].custs.push(info.custName);
  });

  const days = Object.keys(byDay).sort();
  const headers = ["วันที่","จำนวนบิล","ยอดก่อนลด (฿)","ส่วนลด (฿)","ยอดสุทธิ (฿)","🌿 ฟ้าได้ (฿)","🌸 แม่ได้ (฿)","ลูกค้า"];
  const rows = [headers];
  let gBills=0, gSub=0, gDisc=0, gTotal=0, gFah=0, gMom=0;

  days.forEach(day => {
    const d = byDay[day];
    rows.push([
      day, d.bills,
      Math.round(d.subtotal), Math.round(d.discount), Math.round(d.total),
      Math.round(d.fah), Math.round(d.mom),
      [...new Set(d.custs)].join(", ")
    ]);
    gBills+=d.bills; gSub+=d.subtotal; gDisc+=d.discount;
    gTotal+=d.total; gFah+=d.fah; gMom+=d.mom;
  });

  rows.push(["รวมทั้งหมด", gBills, Math.round(gSub), Math.round(gDisc), Math.round(gTotal), Math.round(gFah), Math.round(gMom), ""]);

  sumSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  sumSheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold").setBackground("#1e3a08").setFontColor("#c8e89a").setFontSize(11);
  sumSheet.getRange(rows.length, 1, 1, headers.length)
    .setFontWeight("bold").setBackground("#EAF3DE").setFontColor("#1e3a08");
  for (let r = 2; r < rows.length; r++) {
    sumSheet.getRange(r, 1, 1, headers.length)
      .setBackground(r % 2 === 0 ? "#f7f7f5" : "#ffffff");
  }
  sumSheet.getRange(2, 3, rows.length-1, 5).setNumberFormat("#,##0");
  sumSheet.autoResizeColumns(1, headers.length);
  sumSheet.getRange(rows.length+2, 1).setValue("อัปเดตล่าสุด: " + new Date().toLocaleString("th-TH"));
}

/* ───────────────────────────────────────────────
   CUSTOMERS  (ชีต "Customers", คอลัมน์ A-E)
   A name | B phone | C points | D note | E totalSpent
─────────────────────────────────────────────── */
/* ───────────────────────────────────────────────
   IMAGE UPLOAD  — อัปโหลดรูปขึ้น Google Drive
   รับ base64 (data:image/...;base64,...) → อัปโหลดเป็นไฟล์ใน Drive
   → ตั้งเป็น public → return URL สำหรับเก็บลง Sheets
─────────────────────────────────────────────── */
function uploadImage(data) {
  const b64 = data.imageBase64 || "";
  const match = b64.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data");
  const mimeType = match[1];
  const raw = match[2];
  const blob = Utilities.newBlob(Utilities.base64Decode(raw), mimeType, "treesiri_" + Date.now() + ".jpg");
  // อัปโหลดเข้า folder "TreeSiri POS Images" (สร้างอัตโนมัติถ้ายังไม่มี)
  const folders = DriveApp.getFoldersByName("TreeSiri POS Images");
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("TreeSiri POS Images");
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = file.getId();
  // ใช้ thumbnail URL — เปิดได้ใน <img> tag โดยตรง
  return { url: "https://drive.google.com/thumbnail?id=" + id + "&sz=w600" };
}

/* ── บันทึกลำดับการแสดงสินค้า (column A = sortOrder) ─── */
function updateSortOrder(ss, data) {
  const sheet = ss.getSheetByName("Products");
  const lastRow = sheet.getLastRow();
  (data.order || []).forEach(item => {
    const row = parseInt(item.row);
    if (row >= 2 && row <= lastRow) {
      sheet.getRange(row, 1).setValue(parseInt(item.pos)); // A
    }
  });
  return {};
}

/* ── ลบบิล (ลบทุก row ของบิล จาก sheetRow ถึง lastSheetRow) ── */
function deleteSaleByRow(ss, data) {
  const sheet = ss.getSheetByName("Sales");
  const firstRow = parseInt(data.sheetRow);
  const lastRow  = parseInt(data.lastSheetRow) || firstRow;
  if (!firstRow || firstRow < 2) throw new Error("Invalid sheetRow: " + data.sheetRow);
  // ลบจากล่างขึ้นบน เพื่อไม่ให้ row number เลื่อน
  for (let r = lastRow; r >= firstRow; r--) {
    sheet.deleteRow(r);
  }
  updateSummary(ss);
  return {};
}

/* ── แก้ไขบิล (discount / total / custName) ── */
function editSale(ss, data) {
  const sheet = ss.getSheetByName("Sales");
  const row = parseInt(data.sheetRow); // first row ของบิล
  if (!row || row < 2) throw new Error("Invalid sheetRow: " + data.sheetRow);
  // I=9: ส่วนลด, J=10: ยอดสุทธิ, K=11: ลูกค้า
  sheet.getRange(row, 9).setValue(parseFloat(data.discount) || 0);
  sheet.getRange(row, 10).setValue(parseFloat(data.total) || 0);
  sheet.getRange(row, 11).setValue(data.custName || "");
  updateSummary(ss);
  return { newTotal: parseFloat(data.total) || 0 };
}

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

/* ───────────────────────────────────────────────
   EXPENSES  (ชีต "Expenses", คอลัมน์ A-D)
   A date (YYYY-MM-DD) | B name | C amount | D owner (ร่วม/แม่/ฟ้า — ใครหักกำไร)
   ⚠️ สร้างชีตชื่อ "Expenses" ใน Google Sheet ก่อนใช้
─────────────────────────────────────────────── */
function addExpense(ss, data) {
  let sheet = ss.getSheetByName("Expenses");
  if (!sheet) {
    sheet = ss.insertSheet("Expenses");
    sheet.getRange(1, 1, 1, 4).setValues([["Date","Name","Amount","Owner"]]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold");
  }
  sheet.appendRow([data.date || "", data.name || "", parseFloat(data.amount) || 0, data.owner || "ร่วม"]);
  return {};
}

function deleteExpenseByRow(ss, data) {
  const sheet = ss.getSheetByName("Expenses");
  if (!sheet) throw new Error("ไม่พบชีต 'Expenses'");
  const row = parseInt(data.sheetRow);
  if (!row || row < 2) throw new Error("Invalid sheetRow: " + data.sheetRow);
  sheet.deleteRow(row);
  return {};
}
