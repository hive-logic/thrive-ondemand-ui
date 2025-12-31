import { NextResponse } from 'next/server';
import webPush from 'web-push';
import redis from '@/lib/redis';
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '@/lib/push-config';

// VAPID ayarlarını yap
webPush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export async function POST(request: Request) {
  try {
    const { message, title, url } = await request.json();

    // 1. Tüm kayıtlı abonelerin Key'lerini çek
    const keys = await redis.smembers('all_subs');

    if (!keys || keys.length === 0) {
      return NextResponse.json({ message: 'No subscribers found' });
    }

    console.log(`Found ${keys.length} subscribers. Sending notifications...`);

    const notificationPayload = JSON.stringify({
      title: title || 'Thrive OnDemand',
      body: message || 'New announcement!',
      icon: '/icon.png',
      url: url || '/'
    });

    // 2. Herkes için gönderim yap (Parallel)
    const results = await Promise.allSettled(keys.map(async (key) => {
      // Key'e karşılık gelen detaylı subscription objesini çek
      const subString = await redis.get(key);
      
      if (!subString) return { status: 'skipped', key };

      const sub = JSON.parse(subString);

      try {
        await webPush.sendNotification(sub, notificationPayload);
        return { status: 'success', key };
      } catch (err: any) {
        // Eğer kullanıcı aboneliği iptal ettiyse (410 Gone), listemizden temizleyelim
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Subscription gone, removing: ${key}`);
          await redis.del(key);
          await redis.srem('all_subs', key);
        }
        throw err;
      }
    }));

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    return NextResponse.json({ 
      success: true, 
      total: keys.length,
      sent: successCount,
      message: `Sent to ${successCount} of ${keys.length} subscribers`
    });

  } catch (error) {
    console.error('Broadcast error:', error);
    return NextResponse.json({ error: 'Broadcast failed' }, { status: 500 });
  }
}

