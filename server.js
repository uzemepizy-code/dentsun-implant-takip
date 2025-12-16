const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
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

app.use(
  session({
    secret: "dentsun-10-haneli-giris",
    resave: false,
    saveUninitialized: false
  })
);

// -------------------- 10 HANELİ GİRİŞ KODU --------------------
function sumDigits(n) {
  return String(n).padStart(2, "0").split("").reduce((a, c) => a + Number(c), 0);
}

function twoDigits(n) {
  return String(n).padStart(2, "0");
}

function generateLoginCode(d = new Date()) {
  // ---- TARİH ----
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  const Sd = sumDigits(day);
  const Sm = sumDigits(month);
  const product = twoDigits(Sd * Sm);

  const A = product[0];
  const B = product[1];

  const Y = String(year).split(""); // 2025 -> ["2","0","2","5"]

  const left3 = `${Y[0]}${A}${Y[1]}`;      // 220
  const right3 = `${Y[2]}${B}${Y[3]}`;    // 215

  // ---- SAAT ----
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  const h1 = Number(hh[0]);
  const h2 = Number(hh[1]);
  const m1 = Number(mm[0]);
  const m2 = Number(mm[1]);

  const inner = twoDigits(h2 * m1); // ortadakiler
  const outer = twoDigits(h1 * m2); // dıştakiler

  // ---- FİNAL 10 HANE ----
  return `${outer[0]}${left3}${inner}${right3}${outer[1]}`;
}

// -------------------- AUTH --------------------
function requireAuth(req, res, next) {
  if (req.session.auth) return next();
  res.redirect("/login");
}

// -------------------- LOGIN --------------------
app.get("/login", (req, res) => {
  res.send(`
    <h2>Dentsun Implant Takip</h2>
    <form method="POST">
      <input name="code" maxlength="10" placeholder="****" autofocus>
      <button>Giriş</button>
    </form>
  `);
});

app.post("/login", (req, res) => {
  const userCode = req.body.code;
  const serverCode = generateLoginCode(new Date());

  if (userCode === serverCode) {
    req.session.auth = true;
    return res.redirect("/");
  }

  res.send("<h3>❌ Kod yanlış</h3><a href='/login'>Geri</a>");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

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

// -------------------- STOK LOG --------------------
function logStock(branch, diameter, length, qty, action) {
  db.prepare(`
    INSERT INTO stock_log
    (branch, diameter, length, qty, action, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(branch, diameter, length, qty, action, new Date().toLocaleString("tr-TR"));
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

// -------------------- START --------------------
app.listen(3000, () => {
  console.log("Sunucu çalışıyor: http://localhost:3000");
  console.log("LOGIN CODE:", generateLoginCode(new Date()));
});
