import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function POST(request: Request) {
  try {
    const { subscription } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    // Kullanıcıyı unique yapmak için endpoint'i key olarak kullanabiliriz
    // Veya basitçe bir listeye ekleyebiliriz. Listeye eklemek broadcast için daha kolay.
    // Ancak listede duplicate olmaması için Set yapısı (sadd) kullanmak daha mantıklı.
    // Ama KV'de 'sadd' objeyi string olarak tutar.

    // Yöntem: 'subscriptions' adında bir List (veya Set) tutalım.
    // Her abone olduğunda bu listeye ekleyelim.
    
    // Not: KV ücretsiz planda request limiti vardır, ama demo için yeterli.
    
    // Unique ID üret (Endpoint'in son kısmı genelde unique ID'dir)
    const subId = subscription.endpoint.split('/').pop();
    const key = `sub:${subId}`;

    // 1. Aboneliği detaylı olarak sakla
    await kv.set(key, subscription);

    // 2. ID'yi ana listeye ekle (Broadcast yaparken bu listeden ID'leri çekeceğiz)
    await kv.sadd('all_subs', key);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

