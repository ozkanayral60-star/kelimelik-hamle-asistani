# Kelimelik Hamle Asistanı — iPhone PWA

Bu paket, iPhone 13 Safari'de çalışan ve Ana Ekrana Eklenebilen ilk kullanılabilir sürümdür.

## Bu sürümde çalışanlar
- 15×15 tahta; özel kare düzeni kullanıcının sağladığı boş tahta ekran görüntüsüne göre işlendi.
- H2, H3, K2, K3.
- İlk hamlede merkez 2 yıldızdan geçme ve kelime ×2.
- 3 yıldız karesi: sabit +25 puan.
- Joker: istediği harfin yerine geçer, 0 puan.
- 1–7 eldeki taş desteği.
- Yatay/dikey gerçek tahta hamlesi; mevcut taşla birleşme ve yan kelime doğrulaması.
- Puan sıralaması, taş sayısı filtresi, hamleyi tahtada ön izleme.
- Tam Türkçe sözlük listesini cihaz içine indirme ve IndexedDB'de saklama.
- Kelime ekleme / engelleme.
- Web Worker ile hesaplama; arayüz hesap sırasında kilitlenmez.
- PWA / service worker / offline çekirdek.

## Sözlük
Uygulama ilk açılışta küçük bir yerleşik sözlükle gelir. `Sözlük > Tam sözlüğü indir / güncelle` seçeneği, CanNuhlar/Turkce-Kelime-Listesi reposundaki TDK İmla Kılavuzu tabanlı açık kelime listesini tarayıcıdan indirir. Çok sözcüklü ifadeler, özel adlar ve tahta harfleri dışında karakter içeren girdiler filtrelenir. Kelimelik'in kendi sözlüğü TDK ile birebir aynı olmayabileceği için uygulamada kelime ekleme/engelleme vardır.

Kaynak: https://github.com/CanNuhlar/Turkce-Kelime-Listesi

## iPhone'a kurma
PWA'nın service worker'ı için dosyaları HTTPS üzerinden yayınlayın. GitHub Pages, Cloudflare Pages, Netlify veya Vercel kullanılabilir.

Safari'de yayın adresini açın → Paylaş → Ana Ekrana Ekle.

## Yerelde test
Basit bir statik sunucu yeterlidir:

```bash
python -m http.server 8080
```

Ardından `http://localhost:8080` açın.

## Not
Ekran görüntüsünden otomatik tahta okuma (OCR/görüntü tanıma) bu ilk çekirdek sürüme bilerek dahil edilmedi. Önce hamle motoru ve puanlamanın gerçek oyunlarla doğrulanması hedeflendi. Sonraki sürümde ekran görüntüsü yükleme + düzeltme ekranı eklenebilir.
