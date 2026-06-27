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
      case "uploadImage":       result = uploadImage(data); break;
      case "rebuildSummary":    result = (updateSummary(ss), {}); break;
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
   PRODUCTS  (ชีต "Products", คอลัมน์ A-K)
   A name | B lot | C cat | D price | E stock | F emoji
   G imgUrl | H defaultPct | I stockFah | J stockMom | K cost
   (ถ้ายังไม่มีคอลัมน์ K ให้เพิ่มหัวคอลัมน์ "cost" ในชีต Products)
─────────────────────────────────────────────── */
function addProduct(ss, p) {
  const sheet = ss.getSheetByName("Products");
  sheet.appendRow([
    p.name || "", p.lot || "", p.cat || "",
    p.price || 0, p.stock || 0,
    p.emoji || "🌿", p.imgUrl || "",
    p.defaultPct ?? 50,
    p.stockFah || 0,
    p.stockMom || 0,
    p.cost || 0
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
  sheet.getRange(row, 11).setValue(p.cost || 0);      // K
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
  updateSummary(ss); // อัปเดตชีตสรุปผลทุกครั้งที่มีการขาย
  return {};
}

/* ───────────────────────────────────────────────
   SUMMARY  (ชีต "สรุปผล") — อัปเดตอัตโนมัติทุกครั้งที่บันทึกขาย
   แสดงยอดรายวัน: จำนวนบิล, ยอดก่อนลด, ส่วนลด, ยอดสุทธิ, ฟ้าได้, แม่ได้
─────────────────────────────────────────────── */
function updateSummary(ss) {
  const salesSheet = ss.getSheetByName("Sales");
  let sumSheet = ss.getSheetByName("สรุปผล");
  if (!sumSheet) sumSheet = ss.insertSheet("สรุปผล");
  sumSheet.clearContents().clearFormats();

  const data = salesSheet.getDataRange().getValues();
  if (data.length <= 1) return;

  // จัดกลุ่มยอดตามวัน
  const byDay = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dateStr = String(row[0] || "").trim();
    if (!dateStr) continue;

    // แปลง date string → key "YYYY-MM-DD" (รองรับทั้ง ISO และ DD/MM/YYYY)
    let dayKey = "";
    const iso = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    const dmy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (iso) dayKey = iso[1];
    else if (dmy) dayKey = dmy[3] + "-" + String(dmy[2]).padStart(2,"0") + "-" + String(dmy[1]).padStart(2,"0");
    else continue;

    const subtotal = parseFloat(row[2]) || 0;
    const discount = parseFloat(row[3]) || 0;
    const total    = parseFloat(row[4]) || 0;
    const itemsStr = String(row[1] || "");
    const custName = String(row[5] || "");

    // คำนวณ ฟ้า/แม่ ต่อบิล — หักส่วนลดก่อนแล้วค่อยแบ่งตาม fahPct ของรายการ
    let fahTotal = 0, momTotal = 0;
    const discRatio = subtotal > 0 ? discount / subtotal : 0;
    itemsStr.split(",").forEach(seg => {
      const p = seg.trim().split("×");
      const qty   = parseInt(p[1]) || 1;
      const price = parseFloat(p[2]) || 0;
      const fPct  = (parseFloat(p[3]) >= 0 ? parseFloat(p[3]) : 50) / 100;
      const net   = qty * price * (1 - discRatio);
      fahTotal += net * fPct;
      momTotal += net * (1 - fPct);
    });

    if (!byDay[dayKey]) byDay[dayKey] = {bills:0, subtotal:0, discount:0, total:0, fah:0, mom:0, custs:[]};
    byDay[dayKey].bills++;
    byDay[dayKey].subtotal += subtotal;
    byDay[dayKey].discount += discount;
    byDay[dayKey].total    += total;
    byDay[dayKey].fah      += fahTotal;
    byDay[dayKey].mom      += momTotal;
    if (custName) byDay[dayKey].custs.push(custName);
  }

  const days = Object.keys(byDay).sort();

  // สร้าง rows
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

  // แถวรวมทั้งหมด
  rows.push(["รวมทั้งหมด", gBills, Math.round(gSub), Math.round(gDisc), Math.round(gTotal), Math.round(gFah), Math.round(gMom), ""]);

  sumSheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  // จัดรูปแบบ header
  sumSheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold").setBackground("#1e3a08").setFontColor("#c8e89a").setFontSize(11);
  // จัดรูปแบบแถวรวม
  sumSheet.getRange(rows.length, 1, 1, headers.length)
    .setFontWeight("bold").setBackground("#EAF3DE").setFontColor("#1e3a08");
  // แถวข้อมูลสลับสี
  for (let r = 2; r < rows.length; r++) {
    sumSheet.getRange(r, 1, 1, headers.length)
      .setBackground(r % 2 === 0 ? "#f7f7f5" : "#ffffff");
  }
  // จัด format ตัวเลข
  sumSheet.getRange(2, 3, rows.length-1, 5).setNumberFormat("#,##0");
  sumSheet.autoResizeColumns(1, headers.length);

  // อัปเดต timestamp
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

/* ── ลบบิล ─────────────────────────────────────────────── */
function deleteSaleByRow(ss, data) {
  const sheet = ss.getSheetByName("Sales");
  const row = parseInt(data.sheetRow);
  if (!row || row < 2) throw new Error("Invalid sheetRow: " + data.sheetRow);
  sheet.deleteRow(row);
  updateSummary(ss);
  return {};
}

/* ── แก้ไขบิล (discount / custName เท่านั้น) ──────────── */
function editSale(ss, data) {
  const sheet = ss.getSheetByName("Sales");
  const row = parseInt(data.sheetRow);
  if (!row || row < 2) throw new Error("Invalid sheetRow: " + data.sheetRow);
  const subtotal = sheet.getRange(row, 3).getValue();  // C = subtotal
  const newDiscount = parseFloat(data.discount) || 0;
  const newTotal = Math.max(0, subtotal - newDiscount);
  sheet.getRange(row, 4).setValue(newDiscount);        // D = discount
  sheet.getRange(row, 5).setValue(newTotal);           // E = total
  sheet.getRange(row, 6).setValue(data.custName || ""); // F = custName
  updateSummary(ss);
  return { newTotal };
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
