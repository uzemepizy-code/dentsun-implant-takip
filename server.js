const express = require("express");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database("data.db");

// -------------------- AYARLAR --------------------
const BRANCHES = ["Dentsun Menemen", "Dentsun Karşıyaka"];
const DIAMETERS = [3.5, 4, 4.5, 5, 5.5];
const LENGTHS = [7, 8.5, 10, 11.5, 13];

// -------------------- MIDDLEWARE --------------------
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public"));

// -------------------- DB TABLOLARI --------------------
db.prepare(`
CREATE TABLE IF NOT EXISTS stock (
  branch TEXT,
  diameter REAL,
  length REAL,
  qty INTEGER,
  PRIMARY KEY (branch, diameter, length)
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch TEXT,
  name TEXT
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS implants (
  patient_id INTEGER,
  diameter REAL,
  length REAL,
  qty INTEGER
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS stock_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch TEXT,
  diameter REAL,
  length REAL,
  qty INTEGER,
  action TEXT,
  created_at TEXT
)`).run();


// -------------------- STOK İLK OLUŞUM --------------------
for (const b of BRANCHES) {
  for (const d of DIAMETERS) {
    for (const l of LENGTHS) {
      db.prepare(`
        INSERT OR IGNORE INTO stock (branch, diameter, length, qty)
        VALUES (?, ?, ?, 0)
      `).run(b, d, l);
    }
  }
}

// -------------------- AUTH (TEK KULLANICI - BASİT) --------------------
function requireAuth(req, res, next) {
  next(); // şimdilik direkt geçiyor
}

// -------------------- STOK LOG FONKSİYONU --------------------
function logStock(branch, diameter, length, qty, action) {
  db.prepare(`
    INSERT INTO stock_log
    (branch, diameter, length, qty, action, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    branch,
    diameter,
    length,
    qty,
    action,
    new Date().toLocaleString("tr-TR")
  );
}


// -------------------- ANA SAYFA --------------------
app.get("/", requireAuth, (req, res) => {
  const branch = req.query.branch || BRANCHES[0];

  const stock = db.prepare(
    "SELECT * FROM stock WHERE branch=?"
  ).all(branch);

  const patients = db.prepare(
    "SELECT * FROM patients WHERE branch=?"
  ).all(branch);

  res.send(`
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Dentsun İmplant Takip</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>

<h1>Dentsun İmplant Takip</h1>

<form method="GET">
  <select name="branch" onchange="this.form.submit()">
    ${BRANCHES.map(b =>
      `<option ${b===branch?"selected":""}>${b}</option>`
    ).join("")}
  </select>
</form>

<h2>Stok (AnyRidge)</h2>

<a href="/logs" style="display:inline-block;margin-bottom:10px;">
  📜 Stok Loglarını Gör
</a>


<form method="POST" action="/stock">
<input type="hidden" name="branch" value="${branch}">
<table>
<tr>
  <th>Çap \\ Uzunluk</th>
  ${LENGTHS.map(l=>`<th>${l}</th>`).join("")}
</tr>
${DIAMETERS.map(d=>`
<tr>
  <th>${d}</th>
  ${LENGTHS.map(l=>{
    const s = stock.find(x=>x.diameter==d && x.length==l);
    const qty = s ? s.qty : 0;
let cls = "";
if (qty === 0) cls = "stok-zero";
else if (qty <= 2) cls = "stok-low";

return `<td class="${cls}">
  <input type="number" name="s_${d}_${l}" value="${qty}">
</td>`;

  }).join("")}
</tr>
`).join("")}
</table>
<br>
<button>Stoku Kaydet</button>

<a href="/stock/csv?branch=${branch}">
  <button type="button">📊 Stok Excel (CSV)</button>
</a>

</form>

<hr>

<h2>Hasta Ekle</h2>

<form method="POST" action="/patient/add">
  <input type="hidden" name="branch" value="${branch}">
  <input name="name" placeholder="Hasta adı" required><br><br>

  <div id="implantRows"></div>

  <button type="button" onclick="addRow()">+</button>
  <br><br>
  <button>Kaydet</button>
</form>

<script>
let rowCount = 0;
const maxRows = 20;

function addRow() {
  if (rowCount >= maxRows) return;

  const row = document.createElement("div");
  row.innerHTML =
  '<select name="diameter">' +
    '<option value="">Çap</option>' +
    '${DIAMETERS.map(d => `<option value="${d}">${d}</option>`).join("")}' +
  '</select>' +

  '<select name="length">' +
    '<option value="">Uzunluk</option>' +
    '${LENGTHS.map(l => `<option value="${l}">${l}</option>`).join("")}' +
  '</select>' +

  '<input type="number" name="qty" placeholder="adet" style="width:60px">' +
  '<button type="button" onclick="this.parentElement.remove()">❌</button><br>';

  document.getElementById("implantRows").appendChild(row);
  rowCount++;
}

// sayfa açılınca 4 satır
for (let i = 0; i < 4; i++) addRow();
</script>



<br>
<button>Kaydet</button>
</form>

<hr>

<h2>Hastalar</h2>
<ul>
${patients.map(p=>`
<li>
<a href="/patient/edit/${p.id}?branch=${branch}">
  <b>${p.name}</b>
</a>
<a href="/patient/delete/${p.id}?branch=${branch}"
onclick="return confirm('Stok geri eklensin mi?')">[Sil]</a>
</li>

`).join("")}
</ul>

</body>
</html>
`);
});

// -------------------- STOK CSV --------------------
app.get("/stock/csv", requireAuth, (req, res) => {
  const branch = req.query.branch || BRANCHES[0];

  const rows = db.prepare(`
    SELECT diameter, length, qty
    FROM stock
    WHERE branch=?
    ORDER BY diameter, length
  `).all(branch);

  let csv = "";
  csv += `Şube,${branch}\n`;
  csv += `Tarih,${new Date().toLocaleString("tr-TR")}\n\n`;
  csv += "Çap / Uzunluk," + LENGTHS.join(",") + "\n";

  DIAMETERS.forEach(d => {
    let line = [d];
    LENGTHS.forEach(l => {
      const r = rows.find(x => x.diameter==d && x.length==l);
      line.push(r ? r.qty : 0);
    });
    csv += line.join(",") + "\n";
  });

const safeBranch = branch
  .replace(/ğ/g, "g")
  .replace(/ü/g, "u")
  .replace(/ş/g, "s")
  .replace(/ı/g, "i")
  .replace(/ö/g, "o")
  .replace(/ç/g, "c")
  .replace(/\s+/g, "_");

res.setHeader(
  "Content-Disposition",
  `attachment; filename=Dentsun_Stok_${safeBranch}.csv`
);


  res.send(csv);
});


// -------------------- STOK KAYDET --------------------
app.post("/stock", requireAuth, (req, res) => {
  const b = req.body.branch;

  for (const d of DIAMETERS) {
    for (const l of LENGTHS) {
      const v = Math.max(0, parseInt(req.body[`s_${d}_${l}`] || 0));
      const old = db.prepare(`
  SELECT qty FROM stock
  WHERE branch=? AND diameter=? AND length=?
`).get(b, d, l).qty;

db.prepare(`
  UPDATE stock SET qty=?
  WHERE branch=? AND diameter=? AND length=?
`).run(v, b, d, l);

if (old !== v) {
  logStock(b, d, l, v - old, "MANUEL_DUZENLEME");
}

    }
  }
  res.redirect("/?branch="+encodeURIComponent(b));
});

// -------------------- HASTA EKLE --------------------
app.post("/patient/add", requireAuth, (req, res) => {
  const b = req.body.branch;

  const pid = db.prepare(`
    INSERT INTO patients (branch, name)
    VALUES (?, ?)
  `).run(b, req.body.name).lastInsertRowid;

  // dizi olarak geliyor artık
  const diameters = [].concat(req.body.diameter || []);
  const lengths   = [].concat(req.body.length || []);
  const qtys      = [].concat(req.body.qty || []);

  for (let i = 0; i < diameters.length; i++) {
    const d = Number(diameters[i]);
    const l = Number(lengths[i]);
    const q = Number(qtys[i]);

    if (!d || !l || !q || q <= 0) continue;

    db.prepare(`
      INSERT INTO implants (patient_id, diameter, length, qty)
      VALUES (?, ?, ?, ?)
    `).run(pid, d, l, q);

    db.prepare(`
      UPDATE stock SET qty = qty - ?
      WHERE branch=? AND diameter=? AND length=?
    `).run(q, b, d, l);



  }

  res.redirect("/?branch=" + encodeURIComponent(b));
});

// -------------------- HASTA GÜNCELLE --------------------
app.post("/patient/update/:id", requireAuth, (req, res) => {
  const id = req.params.id;
  const branch = req.body.branch;
  const name = req.body.name;

  // 1️⃣ Hasta adını güncelle
  db.prepare(`
    UPDATE patients SET name=?
    WHERE id=?
  `).run(name, id);

  // 2️⃣ Eski implantları al
  const oldImplants = db.prepare(`
    SELECT * FROM implants WHERE patient_id=?
  `).all(id);

  // 3️⃣ Eski implantları stoka geri ekle
  oldImplants.forEach(i => {
    db.prepare(`
      UPDATE stock SET qty = qty + ?
      WHERE branch=? AND diameter=? AND length=?
    `).run(i.qty, branch, i.diameter, i.length);

    logStock(branch, i.diameter, i.length, i.qty, "HASTA_DUZENLEME_GERI");
  });

  // 4️⃣ Eski implant kayıtlarını sil
  db.prepare(`
    DELETE FROM implants WHERE patient_id=?
  `).run(id);

  // 5️⃣ Yeni implantları ekle
  const diameters = [].concat(req.body.diameter || []);
  const lengths   = [].concat(req.body.length || []);
  const qtys      = [].concat(req.body.qty || []);

  for (let i = 0; i < diameters.length; i++) {
    const d = Number(diameters[i]);
    const l = Number(lengths[i]);
    const q = Number(qtys[i]);

    if (!d || !l || !q || q <= 0) continue;

    db.prepare(`
      INSERT INTO implants (patient_id, diameter, length, qty)
      VALUES (?, ?, ?, ?)
    `).run(id, d, l, q);

    db.prepare(`
      UPDATE stock SET qty = qty - ?
      WHERE branch=? AND diameter=? AND length=?
    `).run(q, branch, d, l);

    logStock(branch, d, l, q, "HASTA_DUZENLEME_EKLE");
  }

  // 6️⃣ Ana sayfaya dön
  res.redirect("/?branch=" + encodeURIComponent(branch));
});



// -------------------- HASTA SİL --------------------
app.get("/patient/delete/:id", requireAuth, (req, res) => {
  const id = req.params.id;
  const branch = req.query.branch;

  const imps = db.prepare(`
    SELECT * FROM implants WHERE patient_id=?
  `).all(id);

  imps.forEach(i=>{
    db.prepare(`
      UPDATE stock SET qty = qty + ?
      WHERE branch=? AND diameter=? AND length=?
    `).run(i.qty, branch, i.diameter, i.length);
logStock(branch, i.diameter, i.length, i.qty, "HASTA_SILME");
  });




  db.prepare(`DELETE FROM implants WHERE patient_id=?`).run(id);
  db.prepare(`DELETE FROM patients WHERE id=?`).run(id);

  res.redirect("/?branch="+encodeURIComponent(branch));
});

// -------------------- START --------------------
app.listen(3000, () =>
  console.log("Sunucu çalışıyor: http://localhost:3000")
);


app.get("/patient/edit/:id", requireAuth, (req, res) => {
  const id = req.params.id;
  const branch = req.query.branch;

  const patient = db.prepare(
    "SELECT * FROM patients WHERE id=?"
  ).get(id);

  const implants = db.prepare(
    "SELECT * FROM implants WHERE patient_id=?"
  ).all(id);

  res.send(`
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Hasta Düzenle</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>

<h2>Hasta Düzenle</h2>

<form method="POST" action="/patient/update/${id}">
  <input type="hidden" name="branch" value="${branch}">
  <input name="name" value="${patient.name}" required><br><br>

  <div id="implantRows"></div>

  <button type="button" onclick="addRow()">+</button>
  <br><br>
  <button>Kaydet</button>
</form>

<script>
const existing = ${JSON.stringify(implants)};
let rowCount = 0;

function addRow(d="", l="", q="") {
  const row = document.createElement("div");
  row.innerHTML =
    '<select name="diameter">' +
      '<option value="">Çap</option>' +
      '${DIAMETERS.map(x=>`<option value="${x}">${x}</option>`).join("")}' +
    '</select>' +

    '<select name="length">' +
      '<option value="">Uzunluk</option>' +
      '${LENGTHS.map(x=>`<option value="${x}">${x}</option>`).join("")}' +
    '</select>' +

    '<input type="number" name="qty" style="width:60px">' +
    '<button type="button" onclick="this.parentElement.remove()">❌</button><br>';

  document.getElementById("implantRows").appendChild(row);

  const selects = row.querySelectorAll("select");
  selects[0].value = d;
  selects[1].value = l;
  row.querySelector("input").value = q;

  rowCount++;
}

existing.forEach(i => addRow(i.diameter, i.length, i.qty));
</script>



</body>
</html>
`);
});


// -------------------- STOK LOG --------------------
app.get("/logs", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM stock_log
    ORDER BY id DESC
    LIMIT 200
  `).all();

  res.send(`
  <h2>Stok Log</h2>
  <table border="1" cellpadding="5">
    <tr>
      <th>Tarih</th>
      <th>Şube</th>
      <th>Çap</th>
      <th>Uzunluk</th>
      <th>Adet</th>
      <th>İşlem</th>
    </tr>
    ${rows.map(r => `
      <tr>
        <td>${r.created_at}</td>
        <td>${r.branch}</td>
        <td>${r.diameter}</td>
        <td>${r.length}</td>
        <td>${r.qty}</td>
        <td>${r.action}</td>
      </tr>
    `).join("")}
  </table>

  <br>
  <a href="/">← Geri</a>
  `);
});
