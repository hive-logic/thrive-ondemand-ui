"use client";

import { useState, useEffect, useRef } from "react";
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";
import { loadSession } from "@/lib/session";
import { saveSubscription } from "@/lib/backend-api";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationManager() {
  const [showBanner, setShowBanner] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null
  );

  useEffect(() => {
    // Sadece tarayıcı ve service worker destekliyorsa çalış
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    // Mevcut durumu kontrol et
    checkSubscriptionStatus();
  }, []);

  async function checkSubscriptionStatus() {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });

      const existingSubscription =
        await registration.pushManager.getSubscription();

      // Eğer abone değilse ve izin durumu 'default' ise (henüz sorulmamışsa) banner göster
      if (!existingSubscription && Notification.permission === "default") {
        setShowBanner(true);
      } else if (existingSubscription) {
        setSubscription(existingSubscription);
        const subscriptionJson = existingSubscription.toJSON();
        localStorage.setItem(
          "push_subscription",
          JSON.stringify(subscriptionJson)
        );

        // Mevcut subscription varsa ve user_uuid varsa, backend'e senkronize et
        // (Örn: kullanıcı daha önce izin vermiş ama backend'e gitmemiş olabilir)
        await syncSubscriptionToBackend(subscriptionJson);
      }
    } catch (error) {
      console.error("SW registration failed:", error);
    }
  }

  async function syncSubscriptionToBackend(subscriptionJson: PushSubscriptionJSON) {
    const userUuid = localStorage.getItem("user_uuid");
    const params = new URLSearchParams(window.location.search);
    const activityId = params.get("activity") || localStorage.getItem("activity_id");

    // Daha önce bu subscription backend'e gönderilmiş mi kontrol et
    const lastSyncedSub = localStorage.getItem("push_subscription_synced");
    const currentSubKey = JSON.stringify(subscriptionJson);

    if (userUuid && activityId && lastSyncedSub !== currentSubKey) {
      try {
        await saveSubscription(activityId, userUuid, subscriptionJson);
        localStorage.setItem("push_subscription_synced", currentSubKey);
        console.log("[Push] Subscription synced to backend for user:", userUuid);
      } catch (error) {
        console.error("[Push] Failed to sync subscription to backend:", error);
      }
    }
  }

  async function subscribeToPush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      setSubscription(sub);
      setShowBanner(false); // Banner'ı kapat

      // 1. LocalStorage'a kaydet (toJSON() ile serialize et)
      const subscriptionJson = sub.toJSON();
      localStorage.setItem("push_subscription", JSON.stringify(subscriptionJson));

      // 2. Kullanıcı daha önce giriş yapmışsa (UUID varsa) backend'e gönder
      const userUuid = localStorage.getItem("user_uuid");
      // Activity ID'yi bul
      const params = new URLSearchParams(window.location.search);
      const activityId =
        params.get("activity") || localStorage.getItem("activity_id");

      if (userUuid && activityId) {
        await saveSubscription(activityId, userUuid, subscriptionJson);
        localStorage.setItem("push_subscription_synced", JSON.stringify(subscriptionJson));
        console.log("[Push] Subscription sent to backend for user:", userUuid);
      } else {
        console.log("[Push] Subscription saved locally, will sync after user login. userUuid:", userUuid, "activityId:", activityId);
      }
    } catch (error) {
      console.error("Failed to subscribe:", error);
    }
  }

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="mx-4 mt-2 pt-safe">
        <div className="bg-[#1b1b1c]/90 backdrop-blur-md border border-white/10 text-white p-3 rounded-xl shadow-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-lg">
              🔔
            </span>
            <div className="text-sm font-medium">
              Enable notifications
              <span className="block text-xs text-white/50 font-normal">
                Stay updated with event news
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBanner(false)}
              className="px-3 py-1.5 text-xs text-white/60 hover:text-white transition-colors"
            >
              Later
            </button>
            <button
              onClick={subscribeToPush}
              className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-lg hover:bg-white/90 transition-colors"
            >
              Enable
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
