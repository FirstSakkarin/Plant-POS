/* ════════════════════════════════════════════════════════════
   อัปเดต Apps Script — เพิ่มระบบสต็อกแยกตามร้าน (ร้านฟ้า / ร้านแม่)
   ═══════════════════════════════════════════════════════════
   วิธีใช้ไฟล์นี้:
   1. เปิด Google Sheet ของ TreeSiri → Extensions → Apps Script
   2. ทำตามขั้นตอนที่ 1-3 ด้านล่าง แก้ไขโค้ดเดิมของคุณตามตัวอย่าง
   3. กด Deploy → Manage deployments → แก้ไข (เวอร์ชันใหม่) → Deploy
      (ไม่ต้องเปลี่ยน SCRIPT_URL ถ้า deploy เป็นเวอร์ชันเดิม)

   ขั้นตอน 0: เพิ่มคอลัมน์ในชีต "Products"
   ─────────────────────────────────────────────
   ไปที่ชีต Products แล้วเพิ่มหัวคอลัมน์ใหม่ 2 คอลัมน์:
     คอลัมน์ I  = stockFah   (จำนวนต้นที่อยู่หน้าร้านฟ้า)
     คอลัมน์ J  = stockMom   (จำนวนต้นที่อยู่หน้าร้านแม่)
   แถวเดิมที่ยังไม่มีค่า ให้เว้นว่างไว้ได้ (โค้ดฝั่งหน้าเว็บจะอ่านเป็น 0 อัตโนมัติ)

   ขั้นตอน 1: addProduct — แก้ไขให้เขียนคอลัมน์ I, J ด้วย
   ─────────────────────────────────────────────
   หาฟังก์ชัน addProduct (หรือ case "addProduct" ใน doPost) ของคุณ
   ซึ่งปัจจุบันจะ appendRow ด้วยค่า name,lot,cat,price,stock,emoji,imgUrl,defaultPct (A-H)
   ให้เพิ่ม stockFah, stockMom (I, J) ต่อท้าย ตัวอย่าง:

   function addProduct(p, sheet){
     sheet.appendRow([
       p.name, p.lot, p.cat, p.price, p.stock,
       p.emoji, p.imgUrl, p.defaultPct,
       p.stockFah || 0,     // I
       p.stockMom || 0      // J
     ]);
   }

   ขั้นตอน 2: updateProduct — แก้ไขให้อัปเดตคอลัมน์ I, J ด้วย
   ─────────────────────────────────────────────
   หาฟังก์ชัน updateProduct (หรือ case "updateProduct") ที่ใช้
   sheet.getRange(row, ...).setValue(...) สำหรับคอลัมน์ A-H
   ให้เพิ่มการ set คอลัมน์ 9 (I) และ 10 (J) ด้วย ตัวอย่าง:

   function updateProduct(p, sheet){
     const row = p.row;
     sheet.getRange(row, 1, 1, 8).setValues([[
       p.name, p.lot, p.cat, p.price, p.stock, p.emoji, p.imgUrl, p.defaultPct
     ]]);
     sheet.getRange(row, 9).setValue(p.stockFah || 0);   // I
     sheet.getRange(row, 10).setValue(p.stockMom || 0);  // J
   }

   ขั้นตอน 3: เพิ่ม action ใหม่ "updateStockLocations"
   ─────────────────────────────────────────────
   ใช้สำหรับ:
   - หน้า "ย้ายสต็อก" (ย้ายต้นไม้ระหว่างสวน/ร้านฟ้า/ร้านแม่)
   - หน้าขาย (ตัดสต็อกร้านฟ้า/ร้านแม่ตอนยืนยันการขาย)

   ในฟังก์ชัน doPost(e) ที่มี switch/if ตาม e.parameter.action
   ให้เพิ่ม case ใหม่:

   else if (action === "updateStockLocations") {
     const sheet = ss.getSheetByName("Products");
     const row = parseInt(e.parameter.row);
     sheet.getRange(row, 9).setValue(parseInt(e.parameter.stockFah) || 0);   // I
     sheet.getRange(row, 10).setValue(parseInt(e.parameter.stockMom) || 0); // J
     return ContentService.createTextOutput(JSON.stringify({status:"ok"}))
       .setMimeType(ContentService.MimeType.JSON);
   }

   ═══════════════════════════════════════════════════════════
   สรุป field ที่ frontend ส่งมาเพิ่ม:
   - addProduct / updateProduct: เพิ่ม stockFah, stockMom (ตัวเลข, default 0)
   - updateStockLocations: { action, row, stockFah, stockMom }
   ═══════════════════════════════════════════════════════════ */
