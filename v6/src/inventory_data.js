/* =====================================================================
   inventory_data.js - the office equipment register and the count
   templates derived from the Administration's October 2026 workbooks.

   REDACTION POLICY (applied by v6/tools/redact_inventory.py)
   This file is published. It ships inside public/carelink-v6.html and
   is served to anyone with the URL, before any login. Therefore:
     KEPT    structure - categories, items, quantities, units, condition,
             new/old, source, site-level location, the Foundation's own
             asset labels (LMM/…, LMMK/…), and the count-sheet columns.
     REMOVED manufacturer serial numbers, handset IMEIs, chassis numbers,
             vehicle registration plates, monetary values, and staff names
             used as a location.
   The removed values are recorded on the office host, in the database
   that v6/server.py keeps, where they are behind login and the audit
   trail. They are never committed. See v6/docs/23_INVENTORY_REDACTION.md.
   ===================================================================== */

/* One row per line, so a reviewer can read the register without a tool. */
const INVENTORY_SEED = [
  {cat:"Unclassified", date:"2021-12-02", item:"Toyota Hilux Double Cab", qty:1, unit:"unit", desc:"Toyota Hilux Double Cab (registration held on the office host)", loc:"LOMAMO Homa Bay office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Unclassified", date:"2026-04-03", item:"Toyota Hilux Double Cab", qty:1, unit:"unit", desc:"Toyota Hilux Double Cab (registration held on the office host)", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"DONATION"},
  {cat:"Furniture & Furnishings", date:"2026-10-06", item:"Workstation", qty:1, unit:"unit", desc:"2-way workstation", loc:"Home Stay", serial:"", value:"", cond:"Good", exist:"NEW", src:""},
  {cat:"Furniture & Furnishings", date:"2026-10-06", item:"Office Chairs", qty:2, unit:"unit", desc:"High-back office chairs", loc:"Home Stay", serial:"", value:"", cond:"Good", exist:"NEW", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Bookshelf", qty:1, unit:"unit", desc:"5 shelf bookshelf", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Desk", qty:1, unit:"unit", desc:"Desk with two drawers", loc:"LOMAMO Kisumu office", serial:"LMM/01", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Desk", qty:1, unit:"unit", desc:"Desk with three drawers lockable", loc:"LOMAMO Kisumu office", serial:"LMM/04", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Executive Desk", qty:1, unit:"unit", desc:"executive desk w/3 locking drawers", loc:"Administrative assistants office", serial:"LMM/02", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Executive Desk", qty:1, unit:"unit", desc:"executive desks w/3 locking drawers 7-8' long", loc:"Director's office", serial:"LMM/03", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Executive Desk Chair", qty:1, unit:"unit", desc:"Executive Desk Chair", loc:"Director's office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Executive table", qty:1, unit:"unit", desc:"Executive Table w/12 chairs", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Filing Cabinet", qty:1, unit:"unit", desc:"4-drawer locking Metallic file cabinet", loc:"Director's office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Secretary Chair", qty:1, unit:"unit", desc:"Secretary desk chair on rollers", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2022-11-25", item:"Dust bin", qty:4, unit:"unit", desc:"Plastic dustbin", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2022-11-25", item:"Stool", qty:1, unit:"unit", desc:"Plastic stool", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2024-02-02", item:"OP Visitors Chair ARMOP 700", qty:2, unit:"unit", desc:"OP Visitors Chair ARMOP 700", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2024-02-02", item:"Printer Desk SP800 CHERRY", qty:2, unit:"unit", desc:"Printer Desk SP800 CHERRY", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2024-02-02", item:"Flip Chart Stand Y-333. 90x60cm", qty:1, unit:"unit", desc:"Flip Chart Stand Y-333. 90x60cm(White Board)", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Plastic Baskets", qty:8, unit:"unit", desc:"Plastic Baskets", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Plastic Blue Chairs", qty:8, unit:"unit", desc:"Plastic stackable chairs", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2023-03-04", item:"Acme Armless Chairs", qty:4, unit:"unit", desc:"Acme Armless Plastic Chairs", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2021-11-19", item:"Wooden Table", qty:2, unit:"unit", desc:"Wooden tables in Food Room", loc:"LOMAMO kitchen", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2023-03-04", item:"Curtain strings", qty:6, unit:"unit", desc:"White curtain strings", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2023-03-04", item:"Curtain (Kitchen)", qty:1, unit:"unit", desc:"Doted white", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Furniture & Furnishings", date:"2022-08-04", item:"Curtains", qty:9, unit:"unit", desc:"cotton made curtains with sheers", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2021-11-19", item:"Keyboard", qty:1, unit:"unit", desc:"Keyboard", loc:"LOMAMO Kisumu office", serial:"LMM/KE/05", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2021-11-19", item:"Keyboard", qty:1, unit:"unit", desc:"MicroKingdom Keyboard", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2021-11-19", item:"Wi-Fi Router", qty:1, unit:"unit", desc:"HUAWEI", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2021-11-19", item:"Display Monitor", qty:1, unit:"unit", desc:"Monitor", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2021-11-19", item:"Mouse", qty:1, unit:"unit", desc:"Kensington", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"Keyboard", qty:1, unit:"unit", desc:"HP", loc:"LOMAMO Kisumu office", serial:"LMM/KEY/09", value:"", cond:"Good", exist:"", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2021-11-19", item:"Printer/Scanner", qty:1, unit:"unit", desc:"Epson L3150 Model C634C", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"Desktop Computer", qty:1, unit:"unit", desc:"Acer Desktop Computer Veriton", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"Computer", qty:1, unit:"unit", desc:"HP ProDesk", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"Keyboard", qty:1, unit:"unit", desc:"HP", loc:"LOMAMO Kisumu office", serial:"LMM/KEY/06", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"Monitor", qty:1, unit:"unit", desc:"E221 Elite Display", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"Mouse", qty:1, unit:"unit", desc:"Mouse", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"LENOVO Desktop Computer", qty:1, unit:"unit", desc:"LENOVO Desktop Computer", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"Keyboard", qty:1, unit:"unit", desc:"Lenovo Keyboard", loc:"Administrative assistants office", serial:"LMM/KEY/10", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"Mouse", qty:1, unit:"unit", desc:"Lenovo Mouse", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"Keyboard", qty:1, unit:"unit", desc:"HP", loc:"", serial:"LMM/KEY/07", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-11-19", item:"Keyboard", qty:1, unit:"unit", desc:"", loc:"", serial:"LMM/KEY/08", value:"", cond:"Good", exist:"", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-11-25", item:"Zuku router", qty:1, unit:"unit", desc:"Zuku router", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-04-07", item:"WI-Fi Router", qty:1, unit:"unit", desc:"Airtel Internet", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-08-04", item:"Keyboard", qty:1, unit:"unit", desc:"DEL keyboard", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2022-11-25", item:"Laptop", qty:1, unit:"unit", desc:"Lenovo Laptop", loc:"Director's office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2023-04-20", item:"Multi- travel Adapter", qty:1, unit:"unit", desc:"for Charging Laptop(Director's)", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2023-01-16", item:"Printer", qty:1, unit:"unit", desc:"Canon Pixma wireless", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"HP Elitedesk/Prodesk With Moniter.", qty:1, unit:"unit", desc:"HP Elitedesk/Prodesk With Moniter.Intel Core i5.4Gb RAM. 1TB HDD. 22inch Screen Display. 1 Mouse. 1 Keyboard.(Refubished)", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"HP Elitedesk/Prodesk With Moniter.", qty:1, unit:"unit", desc:"HP Elitedesk/Prodesk With Moniter.Intel Core i5.4Gb RAM. 1TB HDD. 22inch Screen Display. 1 Mouse. 1 Keyboard.(Refubished)", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"HP Elitedesk/Prodesk With Moniter.", qty:1, unit:"unit", desc:"HP Elitedesk/Prodesk With Moniter.Intel Core i5.4Gb RAM. 1TB HDD. 22inch Screen Display. 1 Mouse. 1 Keyboard.(Refubished)", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"Display Monitor", qty:1, unit:"unit", desc:"Display Monitor ProDisplay.ProDisplay P222va", loc:"Admin office", serial:"LMM/DST/13", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"Display Monitor", qty:1, unit:"unit", desc:"Display Monitor ProDisplay.ProDisplay P221va", loc:"LOMAMO Kisumu office", serial:"LMMK/DST/12", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"Display Monitor", qty:3, unit:"unit", desc:"Display Monitor ProDisplay.ProDisplay P221va", loc:"LOMAMO Kisumu office", serial:"LMMK/DST/11", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-02-02", item:"Printer Canon Pixma", qty:1, unit:"unit", desc:"Canon G3410. Wireless.Printing (Colored/Black and White). Scanning.Copying", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2021-11-19", item:"Computer", qty:1, unit:"unit", desc:"HP pro", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2021-11-19", item:"Computer", qty:1, unit:"unit", desc:"Dell Computer", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Computers, IT & Networking Equipment", date:"2024-09-06", item:"HP Elitebook laptop", qty:1, unit:"unit", desc:"HP Elitebook laptop. Grey Colour CoreI7", loc:"Admin office", serial:"", value:"", cond:"Good", exist:"NEW", src:"DONATION"},
  {cat:"Computers, IT & Networking Equipment", date:"2025-06-27", item:"WiFi Adapters", qty:2, unit:"unit", desc:"USB WiFi Dongle Wireless WiFi Antenna WiFi Adaptor", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"BUDGETED"},
  {cat:"Computers, IT & Networking Equipment", date:"2025-06-27", item:"Portable Hard Disk", qty:1, unit:"unit", desc:"WD 500GB External Hard Disk Drive With Cable-Black", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"BUDGETED"},
  {cat:"Computers, IT & Networking Equipment", date:"2026-02-20", item:"Wi-Fi Router", qty:1, unit:"unit", desc:"TL-WA801N", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"BUDGETED"},
  {cat:"Computers, IT & Networking Equipment", date:"2026-02-20", item:"Ethernet cable", qty:1, unit:"unit", desc:"Internet cable", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"BUDGETED"},
  {cat:"Computers, IT & Networking Equipment", date:"2026-07-01", item:"Starlink Mini", qty:1, unit:"unit", desc:"Starlink internet kit", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"BUDGETED"},
  {cat:"Computers, IT & Networking Equipment", date:"2026-06-01", item:"Acer Aspire 14 AI", qty:1, unit:"unit", desc:"Acer laptop Model No. N24Q14", loc:"With staff - Staff Welfare", serial:"", value:"", cond:"Good", exist:"NEW", src:"DONATED"},
  {cat:"Computers, IT & Networking Equipment", date:"2026-06-01", item:"Acer Aspire 14 AI", qty:1, unit:"unit", desc:"Acer laptop Model No. N24Q14", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"NEW", src:"DONATED"},
  {cat:"Computers, IT & Networking Equipment", date:"2026-06-01", item:"HP Laptop", qty:1, unit:"unit", desc:"HP Laptop Prod ID:7L2C7UA#ABA", loc:"With staff - Public Relations", serial:"", value:"", cond:"Good", exist:"NEW", src:"DONATED"},
  {cat:"Computers, IT & Networking Equipment", date:"2026-06-22", item:"USB Drive", qty:1, unit:"unit", desc:"USB 64 Giga Bytes", loc:"LOMAMO Kisumu office", serial:"LMM/USB/1", value:"", cond:"Good", exist:"USED", src:"DONATED"},
  {cat:"Computers, IT & Networking Equipment", date:"2026-06-22", item:"USB Drive", qty:1, unit:"unit", desc:"USB 64 Giga Bytes", loc:"LOMAMO Kisumu office", serial:"LMM/USB/2", value:"", cond:"Good", exist:"USED", src:"DONATED"},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2021-12-02", item:"Honda Generator", qty:1, unit:"unit", desc:"Honda Generator", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2022-08-04", item:"Paper cutter", qty:1, unit:"unit", desc:"Paper cutter-No 949-2", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2022-08-04", item:"Tool box", qty:1, unit:"unit", desc:"toolbox- 22418", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2023-05-23", item:"Pliers", qty:1, unit:"unit", desc:"A red pliers", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2021-11-19", item:"Power Strips", qty:3, unit:"unit", desc:"power strips", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2022-04-07", item:"Extension Cord", qty:1, unit:"unit", desc:"70' extension cord for generator", loc:"Black cabinet by the generator", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2022-04-07", item:"Power Strips", qty:1, unit:"unit", desc:"for extension cord for generator", loc:"Black cabinet by the generator", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2022-04-07", item:"Extension Cord", qty:1, unit:"unit", desc:"for Computers to plug", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2024-12-09", item:"Tyres", qty:4, unit:"unit", desc:"4 tyres Bf Goodrich all Terrain", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2024-12-09", item:"TECH TUBELESS TYRE VALVE", qty:4, unit:"unit", desc:"TR413 TECH TUBELESS TYRE VALVE", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2025-01-07", item:"Car Battery", qty:1, unit:"unit", desc:"Power last chloride exide car battery", loc:"Installed in a Foundation vehicle", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2025-06-27", item:"Power Socket Extension", qty:1, unit:"unit", desc:"Power King Heavy Duty/ Power Socket Extension Cable, 5 Way", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"BUDGETED"},
  {cat:"Tools, Vehicle Parts & Electrical Accessories", date:"2025-09-25", item:"Measuring tape", qty:2, unit:"unit", desc:"Black Colour", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"BUDGETED"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-08-04", item:"Camera", qty:1, unit:"unit", desc:"Canon SX720 HS; PC2272 WITH 2 Camera batteries and dual USB charger", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-08-04", item:"Bluetooth speaker", qty:1, unit:"unit", desc:"Bluetooth speaker", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-06-02", item:"Sim Card", qty:1, unit:"unit", desc:"Safaricom mobile line", loc:"With staff - Hospital Ministry", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-06-02", item:"Sim Card", qty:1, unit:"unit", desc:"Safaricom mobile line", loc:"With staff - Procurement", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-06-02", item:"Sim Card", qty:1, unit:"unit", desc:"Safaricom mobile line", loc:"LOMAMO Homa Bay office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2023-02-28", item:"Sim Card", qty:1, unit:"unit", desc:"Safaricom mobile line", loc:"With staff - Staff Welfare", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-06-02", item:"Sim Card", qty:1, unit:"unit", desc:"Safaricom mobile line", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2023-02-28", item:"Mobile phone", qty:1, unit:"unit", desc:"Tecno spark 7 ; KF6i", loc:"With staff - Staff Welfare", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-08-04", item:"TECNO phone", qty:1, unit:"unit", desc:"Tecno Pop 2Xplus; TECNO RB8S", loc:"Admin office - M-Pesa handset", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-07-22", item:"Lapel Microphone", qty:1, unit:"unit", desc:"Lapel microphone for camera phones 150cm", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-07-22", item:"Lapel Microphone", qty:1, unit:"unit", desc:"Lapel microphone for camera phones 150cm", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-07-22", item:"Lapel Microphone", qty:1, unit:"unit", desc:"Lapel microphone for camera phones 150cm", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2022-07-22", item:"Lapel Microphone", qty:1, unit:"unit", desc:"Lapel microphone for camera phones 150cm", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Missing", exist:"OLD", src:""},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2025-02-20", item:"Tecno Spark 30C", qty:1, unit:"unit", desc:"Tecno Spark 30C Grey Colour", loc:"Nyalenda Ministry", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2025-02-20", item:"Tecno Spark 30C", qty:1, unit:"unit", desc:"Tecno Spark 30C Grey Colour", loc:"Nairobi Road Ministry", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2025-02-20", item:"Tecno Spark 30C", qty:1, unit:"unit", desc:"Tecno Spark 30C Grey Colour", loc:"Ahero Ministry", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2025-04-18", item:"Tecno Spark 30C", qty:1, unit:"unit", desc:"Tecno Spark 30C Grey Colour", loc:"Admin office", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2025-12-06", item:"Tecno Spark 30C", qty:1, unit:"unit", desc:"Tecno Spark 30C Grey Colour", loc:"Hospital Ministry", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2026-03-21", item:"Tecno Spark 40", qty:1, unit:"unit", desc:"Tecno Spark 40 Ink Black Colour", loc:"With staff - Hospital Ministry", serial:"", value:"", cond:"Good", exist:"NEW", src:"SAVINGS"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2026-03-02", item:"Bluetooth Headphones", qty:1, unit:"unit", desc:"JLAB Bluetooth Audio", loc:"LOMAMO Kisumu office", serial:"LMMK/BT/01", value:"", cond:"Good", exist:"NEW", src:"DONATED"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2026-03-02", item:"Bluetooth Headphones", qty:1, unit:"unit", desc:"JLAB Bluetooth Audio", loc:"LOMAMO Kisumu office", serial:"LMMK/BT/02", value:"", cond:"Good", exist:"NEW", src:"DONATED"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2026-03-02", item:"Bluetooth Headphones", qty:1, unit:"unit", desc:"JLAB Bluetooth Audio", loc:"LOMAMO Kisumu office", serial:"LMMK/BT/03", value:"", cond:"Good", exist:"NEW", src:"DONATED"},
  {cat:"Mobile Phones, Communication & AV Equipment", date:"2026-03-02", item:"Bluetooth Headphones", qty:4, unit:"unit", desc:"JLAB Bluetooth Audio", loc:"LOMAMO Kisumu office", serial:"LMMK/BT/04", value:"", cond:"Good", exist:"NEW", src:"DONATED"},
  {cat:"Kitchen & Home Appliances", date:"2022-08-04", item:"Wall fan", qty:1, unit:"unit", desc:"Mika wall fan", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Kitchen & Home Appliances", date:"2022-11-25", item:"Crates of soda", qty:2, unit:"unit", desc:"Crates of soda with 500ml glass bottles", loc:"LOMAMO kitchen", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Kitchen & Home Appliances", date:"2024-11-07", item:"Mika fridge Double Door", qty:1, unit:"unit", desc:"Mika fridge Double Door", loc:"LOMAMO kitchen", serial:"", value:"", cond:"Good", exist:"NEW", src:"DONATION"},
  {cat:"Kitchen & Home Appliances", date:"2024-11-07", item:"Mika fridge guard", qty:1, unit:"unit", desc:"Mika fridge guard", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"NEW", src:"DONATION"},
  {cat:"Safety & Protective Gear", date:"", item:"Gumboots (Number 3/37)", qty:1, unit:"pair", desc:"Black Colour", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Safety & Protective Gear", date:"", item:"Gumboots (Number 6/40)", qty:1, unit:"pair", desc:"Black Colour", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Safety & Protective Gear", date:"", item:"Gumboots (Number 8/42)", qty:1, unit:"pair", desc:"Black Colour", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Safety & Protective Gear", date:"", item:"Gumboots (Number 10/44)", qty:1, unit:"pair", desc:"Black Colour", loc:"LOMAMO Kisumu office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Office Supplies & General Miscellaneous", date:"2023-03-13", item:"Personal weighing scale", qty:1, unit:"unit", desc:"Personal Weighing scale", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Office Supplies & General Miscellaneous", date:"2023-03-13", item:"Personal weighing scale", qty:1, unit:"unit", desc:"Personal Weighing scale", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Office Supplies & General Miscellaneous", date:"2023-03-28", item:"Personal weighing scale", qty:1, unit:"unit", desc:"Personal Weighing scale", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Office Supplies & General Miscellaneous", date:"2023-03-28", item:"Personal weighing scale", qty:1, unit:"unit", desc:"Personal weighing scale", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Office Supplies & General Miscellaneous", date:"2023-07-18", item:"Boxes for storing weighing Machine", qty:4, unit:"unit", desc:"4 wooden boxes for storing weighing machine", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Office Supplies & General Miscellaneous", date:"2022-11-25", item:"Pen holder", qty:1, unit:"unit", desc:"Plastic pen holder", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Office Supplies & General Miscellaneous", date:"2022-11-25", item:"Office tray", qty:2, unit:"unit", desc:"Plastic office tray, one 3- tier, other 2 tier", loc:"Administrative assistants office", serial:"", value:"", cond:"Good", exist:"OLD", src:""},
  {cat:"Office Supplies & General Miscellaneous", date:"2026-06-22", item:"Backpack", qty:1, unit:"unit", desc:"Backpack", loc:"Hospital Ministry", serial:"LMMK/BG/1", value:"", cond:"Good", exist:"USED", src:"DONATED"},
  {cat:"Office Supplies & General Miscellaneous", date:"2026-06-22", item:"Backpack", qty:1, unit:"unit", desc:"Backpack", loc:"LOMAMO Kisumu office", serial:"LMMK/BG/2", value:"", cond:"Good", exist:"USED", src:"DONATED"},
  {cat:"Office Supplies & General Miscellaneous", date:"2026-06-22", item:"Backpack", qty:1, unit:"unit", desc:"Backpack", loc:"LOMAMO Kisumu office", serial:"LMMK/BG/3", value:"", cond:"Good", exist:"USED", src:"DONATED"},
];

/* The register the media department owns. Quantities, categories and sites
   come from the workbook; identifiers and values do not. */
function inventorySeed(){
  return INVENTORY_SEED.map((r,i)=>({
    id:'inv-'+String(i+1).padStart(3,'0'),
    cat:r.cat, date:r.date, item:r.item, qty:+r.qty||0, unit:r.unit||'unit',
    desc:r.desc, loc:r.loc, serial:r.serial, value:r.value, cond:r.cond,
    exist:r.exist, src:r.src
  }));
}

const INVENTORY_CATEGORIES = ["Furniture & Furnishings", "Computers, IT & Networking Equipment", "Tools, Vehicle Parts & Electrical Accessories", "Mobile Phones, Communication & AV Equipment", "Kitchen & Home Appliances", "Safety & Protective Gear", "Office Supplies & General Miscellaneous", "Unclassified"];

/* Closed list of locations. Equipment is issued to a site or a ministry,
   never to a person: the holder is recorded in the movement ledger. */
const INVENTORY_SITES = ["Admin office", "Admin office - M-Pesa handset", "Administrative assistants office", "Ahero Ministry", "Black cabinet by the generator", "Director's office", "Home Stay", "Hospital Ministry", "Installed in a Foundation vehicle", "LOMAMO Homa Bay office", "LOMAMO Kisumu office", "LOMAMO kitchen", "Nairobi Road Ministry", "Nyalenda Ministry", "With staff - Hospital Ministry", "With staff - Procurement", "With staff - Public Relations", "With staff - Staff Welfare"];

/* What the published register deliberately does not carry. */
const INVENTORY_REDACTION = {
  removed: ["manufacturer serial numbers", "handset IMEI numbers", "chassis numbers", "vehicle registration plates", "monetary values", "staff names used as a location"],
  counts: {"serialsRemoved": 65, "valuesRemoved": 52, "locationsReduced": 109, "descriptionsRedacted": 9, "platesRemoved": 2, "imeisRemoved": 9},
  whereTheRealValuesLive:'the office-host database (v6/server.py), behind login and the audit trail',
  policy:'structure is published; identifiers, values and personal names are not',
  tool:'v6/tools/redact_inventory.py',
  check:'python3 v6/tools/verify_no_patient_data.py'
};

/* Kitchen count template - the columns the workbook counts against, and
   what is counted. Quantities are left blank on purpose: they are taken
   by physical count on the office host, which is what the TB dispensing
   protocol requires of every stock line. */
const KITCHEN_COUNT_COLUMNS = ["Items", "Ceramic", "Melamine", "Plastic", "Alluminium", "Glass", "Wooden", "Others", "Working Total", "Less: Broken/ Damaged"];
const KITCHEN_CATALOG = ["Cups(mugs)", "cups with saucers", "Cups", "Jugs", "Tea spoons", "Table spoons", "Serving Spoons", "Sieves", "Fork", "small Knives", "Dinning knives", "Big Knives", "cooking spatula", "Water glasses", "Wine openner", "Bottle top opener", "Pliers", "Kitchen scissors", "Kitchen Tongs", "Meshed cooking spoon for frying", "Potato masher", "Rolling pin", "Cooking Stick", "Short slotted spoon", "Cake slicer", "Grater", "Measuring cups and spoons", "Whisk", "Pestle", "Mortar", "Big Bowls", "Chopping Board", "Hot pot dishes wth Lids", "Frying pans with Lids", "Basins (small)", "Basins (Medium)", "Basins (Big)", "Trays", "Frying Basin", "Sufuria", "Sufuria Lids", "Kitchen Curtain", "Kitchen Towel", "Holding Mats", "Tins( small)", "Tins (medium)", "Tins (Big)", "Kitchen Gloves", "Crate of soda and bottles", "Gas cooker (Von)", "Gas cylinger( K-gas 11.9kg)", "Thermos Flask", "Coffee maker", "Bread Toaster", "Frying pan", "Side Plates", "Plates", "Electric Kettle", "Chapati Pan", "Buckets with taps", "Buckets", "Sink Plunger", "Sky plast", "Sky plast 210L", "Jiko", "Mopping Bucket", "Mops", "Broom", "Food Drainer", "Mixing Bowl", "Funnel", "Ice cube container", "Soup Bowl", "Meshed Trays", "Spoon Tray", "Apron", "Water Dispensor"];

/* Medical, wound-care, equipment, PPE and cleaning supply catalogue. */
const SUPPLY_COUNT_COLUMNS = ["Product Name", "Jun 2026 Quantity", "Jun 2026 Used", "Jun 2026 Remaining", "Oct 2026 Remaining / Qty", "Oct 2026 Used", "In Store", "Given Out", "Remarks"];
const SUPPLY_CATALOG = [
  {cat:"Medicines", item:"ABZ", unit:"tabs", qty:''},
  {cat:"Medicines", item:"Acetaminophen", unit:"tins", qty:''},
  {cat:"Medicines", item:"Ibuprofen", unit:"tins", qty:''},
  {cat:"Medicines", item:"Multivitamins", unit:"tins", qty:''},
  {cat:"Medicines", item:"Vit D3 + K2", unit:"tins", qty:''},
  {cat:"Medicines", item:"Kleen enema", unit:"vials", qty:''},
  {cat:"Medicines", item:"cardinal health cold packs", unit:"unit", qty:''},
  {cat:"Medicines", item:"Fluconazole tablets", unit:"boxes", qty:''},
  {cat:"Medicines", item:"Ferrolic Tablets", unit:"tins", qty:''},
  {cat:"Medicines", item:"Nutripro supplement", unit:"tins", qty:''},
  {cat:"Medicines", item:"Fluconazole injection", unit:"vials", qty:''},
  {cat:"Medicines", item:"Paracetamol", unit:"boxes", qty:''},
  {cat:"Medicines", item:"Ceftriaxone", unit:"vials", qty:''},
  {cat:"Medicines", item:"Ascard 75", unit:"tabs", qty:''},
  {cat:"Medicines", item:"Vitamin B complex", unit:"tins", qty:''},
  {cat:"Medicines", item:"Ondansetrone 4mg", unit:"vials", qty:''},
  {cat:"Medicines", item:"Pyridoxine", unit:"boxes", qty:''},
  {cat:"Medicines", item:"Acyclovir IV", unit:"vial", qty:''},
  {cat:"Medicines", item:"Povidone solution", unit:"ml", qty:''},
  {cat:"Medicines", item:"Aloe vera gel", unit:"bottles", qty:''},
  {cat:"Medicines", item:"Ijzer", unit:"tins", qty:''},
  {cat:"Medicines", item:"Vit B12", unit:"tins", qty:''},
  {cat:"Medicines", item:"Septrin", unit:"boxes", qty:''},
  {cat:"Wound Care", item:"Bandages & Wraps", unit:"unit", qty:''},
  {cat:"Wound Care", item:"Cotton & Absorbent", unit:"unit", qty:''},
  {cat:"Wound Care", item:"Silver & Antimicrobial", unit:"unit", qty:''},
  {cat:"Wound Care", item:"Foam & Hydro", unit:"unit", qty:''},
  {cat:"Wound Care", item:"Alginate", unit:"unit", qty:''},
  {cat:"Wound Care", item:"Antiseptic & Medicated", unit:"unit", qty:''},
  {cat:"Wound Care", item:"Non-Adherent & Contact dressings", unit:"unit", qty:''},
  {cat:"Equipment", item:"Wheelchair", unit:"unit", qty:''},
  {cat:"Equipment", item:"Stethoscope", unit:"unit", qty:''},
  {cat:"Equipment", item:"Thermometers", unit:"unit", qty:''},
  {cat:"Equipment", item:"Infrared gun thermometers", unit:"unit", qty:''},
  {cat:"Equipment", item:"Dressing pack", unit:"unit", qty:''},
  {cat:"Equipment", item:"Rate flow regulator", unit:"unit", qty:''},
  {cat:"Equipment", item:"Guarded coils", unit:"unit", qty:''},
  {cat:"Equipment", item:"Nursing bandage scissors", unit:"pairs", qty:''},
  {cat:"Equipment", item:"Forceps", unit:"pair", qty:''},
  {cat:"Equipment", item:"Drape head turban", unit:"unit", qty:''},
  {cat:"Equipment", item:"Tri-site thermometer equipment", unit:"pieces", qty:''},
  {cat:"Equipment", item:"Verband doos", unit:"unit", qty:''},
  {cat:"Equipment", item:"Drug adherence kits", unit:"unit", qty:''},
  {cat:"Equipment", item:"Mackintosh", unit:"unit", qty:''},
  {cat:"Equipment", item:"Walking Aids", unit:"pair", qty:''},
  {cat:"Equipment", item:"Thoracolumbar corset", unit:"unit", qty:''},
  {cat:"Equipment", item:"Plastic forceps", unit:"unit", qty:''},
  {cat:"Equipment", item:"Disposable scalpels", unit:"unit", qty:''},
  {cat:"Equipment", item:"Pulse oximeter", unit:"unit", qty:''},
  {cat:"Equipment", item:"Glucometer", unit:"unit", qty:''},
  {cat:"PPEs and Socks", item:"Respirator", unit:"unit", qty:''},
  {cat:"PPEs and Socks", item:"Drape head turban", unit:"unit", qty:''},
  {cat:"PPEs and Socks", item:"Gloves", unit:"boxes", qty:''},
  {cat:"PPEs and Socks", item:"Disinfectant wipes", unit:"sachet", qty:''},
  {cat:"PPEs and Socks", item:"Pro-care arm sling", unit:"unit", qty:''},
  {cat:"PPEs and Socks", item:"Surgical spirit", unit:"unit", qty:''},
  {cat:"PPEs and Socks", item:"Wrist- brace", unit:"unit", qty:''},
  {cat:"PPEs and Socks", item:"Alcohol prep pad", unit:"packet", qty:''},
  {cat:"PPEs and Socks", item:"N-95", unit:"unit", qty:''},
  {cat:"PPEs and Socks", item:"zip bags", unit:"unit", qty:''},
  {cat:"PPEs and Socks", item:"Compression stockings", unit:"unit", qty:''},
  {cat:"Cleaning Material", item:"Tide clean", unit:"unit", qty:''},
  {cat:"Cleaning Material", item:"Pantene shampoo", unit:"unit", qty:''},
  {cat:"Cleaning Material", item:"Pantene moisture renewal", unit:"unit", qty:''},
  {cat:"Medicines", item:"Vit D3", unit:"tins", qty:''},
  {cat:"Medicines", item:"Zambuk massage cream", unit:"carton", qty:''},
  {cat:"Medicines", item:"Amino guard", unit:"bottles", qty:''},
  {cat:"Medicines", item:"Gaviscon syrup", unit:"unit", qty:''},
  {cat:"Medicines", item:"Syringes", unit:"unit", qty:''},
  {cat:"Medicines", item:"Silver sulfadiazine cream", unit:"unit", qty:''},
  {cat:"Medicines", item:"clotrimazole cream", unit:"unit", qty:''},
  {cat:"Medicines", item:"Azithromycin tablets", unit:"tablets", qty:''},
  {cat:"Equipment", item:"Underarm crutches", unit:"pair", qty:''},
  {cat:"Equipment", item:"Walking frames", unit:"pair", qty:''},
  {cat:"Equipment", item:"Oraquick HIV testing kits", unit:"unit", qty:''},
  {cat:"Equipment", item:"External male catheters", unit:"unit", qty:''},
  {cat:"Dressing Materials", item:"PPEs & SOCKS", unit:"unit", qty:''},
  {cat:"Dressing Materials", item:"Sanitizers", unit:"litres", qty:''},
  {cat:"Dressing Materials", item:"Disposable face mask", unit:"boxes", qty:''},
];

/* Acquisition notes from the bottom of the sheet. The gift is recorded;
   a named individual is reduced to a role, because a donor's name attached
   to a gift is not this repository's to publish. */
const INVENTORY_NOTES = [
  "In the year 2026 a TP Link wi-fi Access Point router, an ethernet cable, and starlink mini internet kit were bought for office use.",
  "In the year 2026, twenty medium plastic tins were bought for office use.",
  "In February 2026, 4 new bluetooth headphones were donated to LOMAMO Foundation Kenya for office use.",
  "In June 2026 3 laptops were donated by the President and her visiting entourage",
  "On June 2026, 2 Thumbdrives were donated by a visiting donor for Office Use",
  "In April 2026, a new Moto Vehicle, a Hilux Double Cabin was acquired by the LOMAMO Kenya office through a donation",
  "In October 2026, a two-way workstation and 2 high-back chairs were acquired for the HomeStay or Care Center",
];

const INVENTORY_SOURCE = {
  file:'LOMAMO Kisumu Master Inventory october 2026.xlsx',
  sheets:['OFFICE INVENTORY','KITCHEN INVENTORY','MEDICAL SUPPLIES'],
  alsoFrom:'LMMK Medical supplies inventory - OCT2026.xlsx',
  rows:122,
  inRepository:false,
  note:'The workbooks stay on the office host. Only their structure is published.'
};
