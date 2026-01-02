# Web Push Notification Entegrasyonu

Bu doküman, Thrive OnDemand projesi için Web Push Notification entegrasyonunun detaylarını, veri yapılarını ve backend gereksinimlerini içerir.

> **⚠️ ÖNEMLİ (Mevcut Durum)**
>
> - **Frontend Görevi:** Sadece kullanıcıdan izin alıp, oluşan abonelik bilgisini Backend'e iletir.
> - **Backend Görevi:** Abonelikleri kaydeder ve bildirimleri **kendi üzerinden** gönderir.
> - **Güvenlik:** Kullanıcı listesini frontend'e çekmek (list/broadcast) güvenlik riski oluşturduğu için bu özellikler frontend'den kaldırılmıştır.

---

## TL;DR - Yönetici Özeti

Backend entegrasyonu için gereken tek endpoint:

- **Endpoint:** `/api/web-push/subscribe`
- **Method:** `POST`
- **Format:**
  1.  **`activity_id`**: Etkinlik ID'si (Root seviyesinde).
  2.  **`subscription`**: Tarayıcıdan gelen standart push objesi.
  3.  **`user`**: Kullanıcı bilgileri (User Meta). `time` bilgisi buradaki `createdAt` alanıdır.

### Örnek Payload (Backend'e Gelen Veri)

```json
{
  "activity_id": "sewnghln",
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
    "createdAt": 1704134400000,
    "location": {
      "formatted": "Istanbul, Turkey",
      "latitude": 41.0082,
      "longitude": 28.9784
    }
  }
}
```

---

## Backend Bildirim Gönderme Rehberi

Bildirim gönderme işlemi tamamen Backend sunucusu üzerinde yapılmalıdır. Bunun için en popüler ve standart kütüphane **`web-push`**'tır (Node.js için). Diğer dillerde de (Java, Go, PHP) benzer kütüphaneler mevcuttur.

### 1. Kütüphane Kurulumu (Node.js)

```bash
npm install web-push
```

### 2. VAPID Anahtarları

Frontend'de kullanılan `NEXT_PUBLIC_VAPID_PUBLIC_KEY` ile uyumlu olan `VAPID_PRIVATE_KEY` backend tarafında **gizli** olarak saklanmalıdır.

### 3. Bildirim Gönderme Kodu (Örnek)

Aşağıdaki kod bloğu, veritabanından çekilen bir kullanıcıya nasıl bildirim atılacağını gösterir.

```javascript
const webpush = require("web-push");

// 1. VAPID Ayarları (Server Başlarken 1 kere yapılır)
// mailto: kısmına kendi admin mailinizi yazın.
webpush.setVapidDetails(
  "mailto:admin@thrive.com",
  process.env.VAPID_PUBLIC_KEY, // Frontend ile aynı Public Key
  process.env.VAPID_PRIVATE_KEY // Sadece Backend'de olan Private Key
);

// 2. Bu fonksiyonu bildirim göndermek istediğinizde çağırın
async function sendPushNotification(userSubscriptionFromDB, messageText) {
  // DB'den gelen subscription objesi formatı şöyle olmalı:
  const pushSubscription = {
    endpoint: userSubscriptionFromDB.endpoint,
    keys: {
      p256dh: userSubscriptionFromDB.keys.p256dh,
      auth: userSubscriptionFromDB.keys.auth,
    },
  };

  // Gönderilecek Mesajın İçeriği (Payload)
  const payload = JSON.stringify({
    title: "Thrive OnDemand",
    message: messageText,
    // İsteğe bağlı url, icon vb. eklenebilir
    // url: "/chat?activity=..."
  });

  try {
    await webpush.sendNotification(pushSubscription, payload);
    console.log("Bildirim başarıyla gönderildi.");
  } catch (error) {
    if (error.statusCode === 410) {
      console.log("Kullanıcı abonelikten çıkmış, DB'den silinmeli.");
      // await deleteSubscriptionFromDB(userSubscriptionFromDB.id);
    } else {
      console.error("Bildirim hatası:", error);
    }
  }
}
```

### 4. Toplu Gönderim (Broadcast) Mantığı

Bir etkinlikteki (Activity ID) herkese bildirim atmak için:

1.  DB'den o `activity_id`'ye sahip tüm `subscription` kayıtlarını çekin.
2.  Bir döngü (loop) veya `Promise.all` ile her birine yukarıdaki `sendPushNotification` fonksiyonunu çağırın.
3.  Hata alanları (özellikle 410 Gone hatası) DB'den temizleyin.

---

## Detaylı Akış

1.  **İzin İsteme:** Kullanıcı sayfaya girdiğinde (veya butona bastığında) tarayıcıdan bildirim izni istenir.
2.  **Abonelik Oluşturma:** İzin verilirse tarayıcı (Browser Push Service) bir `PushSubscription` objesi üretir.
3.  **Kullanıcı Eşleşmesi & Gönderim:**
    - Kullanıcı henüz form doldurmadıysa: Abonelik `localStorage`'da saklanır.
    - Kullanıcı formu doldurup giriş yapınca: `localStorage`'daki abonelik + User Session bilgisi birleştirilip Backend'e gönderilir.
4.  **Backend Kaydı:** Backend bu veriyi alıp kendi veritabanına kaydeder.
