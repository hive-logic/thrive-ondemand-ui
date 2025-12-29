import { NextResponse } from 'next/server';
import webPush from 'web-push';
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '@/lib/push-config';

webPush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export async function POST(request: Request) {
  try {
    const { subscription, payload } = await request.json();

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription provided' }, { status: 400 });
    }

    const notificationPayload = JSON.stringify({
      title: payload?.title || 'Notification Test',
      body: payload?.body || 'This is a test notification from the server!',
      icon: '/favicon.png',
    });

    await webPush.sendNotification(subscription, notificationPayload);

    return NextResponse.json({ success: true, message: 'Notification sent successfully' });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}


