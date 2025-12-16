function stokCsvIndir() {
  // Bunlar senin sistemde ZATEN VAR
  // İsimler farklıysa birazdan düzelteceğiz
  const subeAdi = window.seciliSube || "Sube";
  const stok = window.stok;
  const caplar = window.caplar;
  const uzunluklar = window.uzunluklar;

  let csv = "";

  // Başlık
  csv += `Şube:,${subeAdi}\n`;
  csv += `Tarih:,${new Date().toLocaleString("tr-TR")}\n\n`;

  // Tablo başlığı
  csv += "Çap / Uzunluk," + uzunluklar.join(",") + "\n";

  // Satırlar
  caplar.forEach(cap => {
    let row = [cap];
    uzunluklar.forEach(u => {
      row.push(stok?.[cap]?.[u] ?? 0);
    });
    csv += row.join(",") + "\n";
  });

  // Dosya oluştur & indir
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `Dentsun_Stok_${subeAdi}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}
