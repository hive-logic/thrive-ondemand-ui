self.addEventListener("push", function (event) {
  console.log("[Service Worker] Push Received.");
  let data = {};
  if (event.data) {
    try {
      console.log("[Service Worker] Event data:", event.data);
      // Önce JSON olarak parse etmeyi dene
      data = event.data.json();
      console.log("[Service Worker] Parsed JSON data:", data);
    } catch (e) {
      // JSON değilse düz metin olarak al
      console.log("[Service Worker] Data is not JSON, treating as text");
      data = {
        title: "Notification",
        body: event.data.text(),
      };
    }
  }

  const options = {
    body: data.body || "New notification",
    icon: data.icon || "/favicon.png",
    badge: data.badge || "/favicon.png",
    vibrate: [100, 50, 100],
    requireInteraction: true,
    data: {
      dateOfArrival: Date.now(),
      primaryKey: "2",
      url: data.url || "https://thrive-ondemand-ui.vercel.app",
      msgBody: data.body, // Mesajı popup'ta göstermek için sakla
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Thrive", options)
  );
});

self.addEventListener("notificationclick", function (event) {
  console.log("[Service Worker] Notification click received.");

  event.notification.close();

  // Bildirimdeki mesajı al
  const msgBody =
    event.notification.data && event.notification.data.msgBody
      ? event.notification.data.msgBody
      : "New Notification";

  // URL'e parametre olarak ekle (Encode ederek)
  const targetUrl =
    new URL("/", self.location.origin).href +
    "?notification_msg=" +
    encodeURIComponent(msgBody);

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        // Eğer açık bir tab varsa ona odaklan ve URL'i güncelle (Popup açılsın)
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          // Sadece origin eşleşiyorsa
          if (
            client.url.startsWith(self.location.origin) &&
            "focus" in client
          ) {
            client.navigate(targetUrl); // Varolan tabı yönlendir
            return client.focus();
          }
        }
        // Yoksa yeni aç
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
