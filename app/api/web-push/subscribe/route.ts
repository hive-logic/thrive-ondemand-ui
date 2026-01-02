import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST(request: Request) {
  try {
    const { subscription } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }
    
    // Unique ID üret
    const subId = subscription.endpoint.split('/').pop();
    const key = `sub:${subId}`;

    console.log('Saving subscription:', key); // LOG EKLE

    // 1. Aboneliği sakla
    await redis.set(key, JSON.stringify(subscription));

    // 2. ID'yi ana listeye (Set) ekle
    const added = await redis.sadd('all_subs', key);
    console.log('Added to set:', added); // LOG EKLE

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

