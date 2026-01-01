# Web Push Notification Entegrasyon Dökümanı

## ⚡️ TL;DR - Yönetici Özeti (Hızlı Entegrasyon)

Backend entegrasyonu için gereken en temel bilgiler aşağıdadır. Detaylar dokümanın devamındadır.

- **Endpoint:** `/api/web-push/subscribe`
- **Method:** `POST`
- **Format:** Frontend, tarayıcının ürettiği **Subscription** objesi ile bizim ürettiğimiz **User Session** objesini birleştirip gönderir.

### Örnek Payload (Backend'e Gelen Veri)

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/d1...",
    "keys": {
      "p256dh": "BM...",
      "auth": "R2..."
    }
  },
  "user": {
    "session_id": "a1b2c3d4-e5f6-...",
    "name": "Test User",
    "email": "test@thrive.com",
    "location": {
      "formatted": "Istanbul, Turkey",
      "latitude": 41.0082,
      "longitude": 28.9784
    }
  }
}
```

### Test Linki & Komutlar

- **App:** `https://thrive-ondemand-899g40625-harun-sekmens-projects.vercel.app/?activity=sewnghln`
- **DB Temizle:** `curl -X POST "https://thrive-ondemand-899g40625-harun-sekmens-projects.vercel.app/api/web-push/clear"`
- **Listele:** `curl "https://thrive-ondemand-899g40625-harun-sekmens-projects.vercel.app/api/web-push/list"`
- **Bildirim At:**
  ```bash
  curl -v -X POST "https://thrive-ondemand-899g40625-harun-sekmens-projects.vercel.app/api/web-push/broadcast" \
  -H "Content-Type: application/json" \
  -d '{"title":"Merhaba", "message":"Test bildirimi."}'
  ```

---

## 📋 Detaylı Dokümantasyon

### 1. Genel Akış (Workflow)

Sistem, kullanıcıların push bildirimlerine abone olmasını ve bu aboneliklerin kullanıcı oturum (session) bilgileriyle eşleştirilerek saklanmasını sağlar.

1.  **İzin İsteme:** Kullanıcıdan tarayıcı üzerinden bildirim izni istenir.
2.  **Abonelik Oluşturma:** İzin verilirse tarayıcı (Browser Push Service) bir `PushSubscription` objesi üretir.
3.  **Kullanıcı Eşleşmesi:**
    - Kullanıcı henüz form doldurmadıysa: Abonelik `localStorage`'da saklanır.
    - Kullanıcı formu doldurup giriş yapınca: `localStorage`'daki abonelik + User Session bilgisi birleştirilip Backend'e gönderilir.
4.  **Backend Kaydı:** Backend bu veriyi alıp veritabanına kaydeder.
5.  **Gönderim:** Backend, kayıtlı `endpoint` ve `keys` bilgilerini kullanarak `web-push` protokolü üzerinden bildirim gönderir.

### 2. Backend Entegrasyon Detayları

#### Payload Yapısı ve Alan Açıklamaları

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "expirationTime": null,
    "keys": {
      "p256dh": "BNcR...",
      "auth": "R2..."
    }
  },
  "user": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Test User",
    "email": "test@thrive.com",
    "createdAt": 1735845000000,
    "location": {
      "latitude": 41.0082,
      "longitude": 28.9784,
      "accuracy": 20,
      "formatted": "Istanbul, Turkey"
    }
  }
}
```

**1. `subscription` Objesi (Tarayıcı Üretir)**
Bu obje standart **W3C Web Push** objesidir. Tarayıcı tarafından otomatik üretilir.

- **`endpoint`**: Bildirimi göndereceğimiz **Push Servisi URL'idir**.
  - _Örnek:_ Chrome için `fcm.googleapis.com/...`, Safari için `web.push.apple.com/...`.
  - _Kullanımı:_ Backend, bildirimi bu URL'e `POST` eder. Bu URL, o tarayıcıyı ve cihazı temsil eder.
- **`keys`**: Mesaj içeriğini şifrelemek için kullanılan kriptografik anahtarlardır.
  - **`p256dh`**: Kullanıcının Public Key'i (ECDH).
  - **`auth`**: Authentication Secret.
  - _Önemli:_ Web Push standardına göre, mesaj içeriği (payload) bu anahtarlarla şifrelenmeden gönderilirse tarayıcı reddeder.

**2. `user` Objesi (Uygulama Üretir)**
Bu aboneliğin kime ait olduğunu belirten metadata.

- **`session_id`**: Kullanıcının benzersiz oturum ID'si (UUID).
- **`name` / `email`**: Welcome formunda girdiği bilgiler.
- **`location`**: Kullanıcıdan alınan konum bilgisi.

### 3. Bildirim Gönderme (Backend Tarafı)

Backend tarafında (Node.js, Python, Go vb.) bildirim göndermek için standart `web-push` kütüphaneleri kullanılır.

**Örnek (Node.js - web-push kütüphanesi ile):**

```javascript
const webpush = require("web-push");

// VAPID Keys (Backend konfigürasyonu)
webpush.setVapidDetails(
  "mailto:admin@thrive.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Veritabanından çekilen subscription objesi
const pushSubscription = {
  endpoint: "...",
  keys: { p256dh: "...", auth: "..." },
};

const payload = JSON.stringify({
  title: "Merhaba",
  message: "Bu bir test bildirimidir.",
});

webpush
  .sendNotification(pushSubscription, payload)
  .catch((error) => console.error(error));
```

### 4. Test Senaryoları (Mobil & Desktop)

**iOS (Safari) - PWA Senaryosu (Kritik)**
_Not: iOS'te bildirimler sadece uygulama **Ana Ekrana Eklendiğinde** çalışır._

1.  Safari'den linki açın.
2.  "Paylaş" > "Ana Ekrana Ekle" (Add to Home Screen) yapın.
3.  Ana ekrandaki ikondan uygulamayı açın (Direkt Welcome ekranı gelmeli, login istememeli).
4.  Üstteki siyah banttan **"Enable"** diyerek bildirim iznini verin.
5.  Formu doldurup "Start Chat" deyin.
6.  **Uygulamayı kapatın (Ana ekrana dönün).**
7.  Yukarıdaki CURL komutu ile bildirim atın.
8.  Gelen bildirime tıklayın -> Uygulama açılmalı ve modal ekranda kalmalı.

**Veritabanı Kontrolü:**
Kayıtlı aboneleri görmek için:
`curl "https://thrive-ondemand-899g40625-harun-sekmens-projects.vercel.app/api/web-push/list"`
