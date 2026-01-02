'use client';

import { useState, useEffect } from 'react';
import { VAPID_PUBLIC_KEY } from '@/lib/push-config';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationManager() {
  const [showBanner, setShowBanner] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    // Sadece tarayıcı ve service worker destekliyorsa çalış
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    // Mevcut durumu kontrol et
    checkSubscriptionStatus();
  }, []);

  async function checkSubscriptionStatus() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      const existingSubscription = await registration.pushManager.getSubscription();
      
      // Eğer abone değilse ve izin durumu 'default' ise (henüz sorulmamışsa) banner göster
      if (!existingSubscription && Notification.permission === 'default') {
        setShowBanner(true);
      } else if (existingSubscription) {
        setSubscription(existingSubscription);
        // Abone ise LocalStorage'ı güncelle (garanti olsun)
        localStorage.setItem('push_subscription', JSON.stringify(existingSubscription));
      }
    } catch (error) {
      console.error('SW registration failed:', error);
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
      
      // 1. LocalStorage'a kaydet
      localStorage.setItem('push_subscription', JSON.stringify(sub));

      // 2. Kullanıcı giriş yapmışsa backend'e gönder
      const storedUser = localStorage.getItem('thrive_user');
      if (storedUser) {
        await fetch('/api/web-push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            subscription: sub,
            user: JSON.parse(storedUser) 
          }),
        });
      }
    } catch (error) {
      console.error('Failed to subscribe:', error);
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
              <span className="block text-xs text-white/50 font-normal">Stay updated with event news</span>
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


