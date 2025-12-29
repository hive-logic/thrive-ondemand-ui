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
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Tarayıcı desteğini kontrol et
    const isServiceWorkerSupported = 'serviceWorker' in navigator;
    const isPushManagerSupported = 'PushManager' in window;

    if (isServiceWorkerSupported && isPushManagerSupported) {
      setIsSupported(true);
      registerServiceWorker();
    } else {
      console.log('Push Notifications not supported.');
      console.log('ServiceWorker:', isServiceWorkerSupported);
      console.log('PushManager:', isPushManagerSupported);
    }
  }, []);

  async function registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      console.log('Service Worker registered with scope:', registration.scope);
      
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        setSubscription(existingSubscription);
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error);
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
      setMessage('Subscribed successfully!');
      console.log('Subscription object:', JSON.stringify(sub));
    } catch (error) {
      console.error('Failed to subscribe:', error);
      setMessage('Failed to subscribe. See console for details.');
    }
  }

  async function sendTestNotification(delay: number = 0) {
    if (!subscription) {
      setMessage('No subscription found.');
      return;
    }

    // İzin kontrolü
    if (Notification.permission !== 'granted') {
      setMessage(`Permission issue: ${Notification.permission}. Please reset permissions.`);
      return;
    }

    try {
      if (delay > 0) {
        setMessage(`Sending notification in ${delay/1000} seconds... You can close the tab now to test background delivery.`);
      } else {
        setMessage('Sending test notification...');
      }

      const response = await fetch('/api/web-push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription,
          payload: {
            title: 'Test Notification',
            body: delay > 0 
              ? `This notification arrived after ${delay/1000} seconds!` 
              : `Hello! This is a test sent at ${new Date().toLocaleTimeString()}`,
          },
          delay,
        }),
      });

      if (response.ok) {
        if (delay === 0) setMessage('Notification sent from server! Check your OS notification center.');
      } else {
        setMessage('Failed to send notification (Server error).');
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      setMessage('Error sending notification.');
    }
  }

  if (!isSupported) {
    return (
      <div className="p-4 border rounded shadow-sm bg-white text-black max-w-md mx-auto mt-4">
        <h3 className="text-lg font-bold mb-2">Push Notifications</h3>
        <div className="text-red-600 mb-2">
          Push notifications are not supported in this browser.
        </div>
        <div className="text-xs text-gray-500">
          <p>Notes:</p>
          <ul className="list-disc pl-4 mt-1">
            <li>iOS (iPhone/iPad): You must add this app to your Home Screen first (Share {'>'} Add to Home Screen). Requires iOS 16.4+.</li>
            <li>Make sure you are not in Incognito/Private mode.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded shadow-sm bg-white text-black max-w-md mx-auto mt-4">
      <h3 className="text-lg font-bold mb-2">Push Notifications</h3>
      
      <div className="mb-4">
        {subscription ? (
          <div className="text-green-600 font-medium mb-2">
            ✓ Subscribed to notifications
          </div>
        ) : (
          <div className="text-gray-600 mb-2">
            Not subscribed yet.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {!subscription && (
          <button
            onClick={subscribeToPush}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          >
            Allow Notifications
          </button>
        )}

        {subscription && (
          <>
            <button
              onClick={() => sendTestNotification(0)}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
            >
              Send Test Notification (Now)
            </button>
            <button
              onClick={() => sendTestNotification(5000)}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
            >
              Send in 5 Seconds (Close Tab to Test)
            </button>
          </>
        )}
      </div>

      {message && (
        <div className="mt-4 text-sm text-gray-700 bg-gray-100 p-2 rounded">
          {message}
        </div>
      )}
    </div>
  );
}


