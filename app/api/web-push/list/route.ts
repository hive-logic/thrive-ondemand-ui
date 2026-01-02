import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export const dynamic = 'force-dynamic'; // Cache'lenmemesi için

export async function GET() {
  try {
    // 1. Tüm abone ID'lerini çek
    const keys = await redis.smembers('all_subs');

    if (!keys || keys.length === 0) {
      return NextResponse.json({ count: 0, subscribers: [] });
    }

    // 2. Her ID'nin detayını çek
    const subscribers = await Promise.all(keys.map(async (key) => {
      const data = await redis.get(key);
      if (!data) return null;
      
      try {
        const parsed = JSON.parse(data);
        return {
          id: key,
          ...parsed
        };
      } catch (e) {
        return { id: key, raw: data, error: 'JSON parse failed' };
      }
    }));

    // Boş (silinmiş) olanları filtrele
    const validSubscribers = subscribers.filter(s => s !== null);

    return NextResponse.json({
      count: validSubscribers.length,
      subscribers: validSubscribers
    });

  } catch (error) {
    console.error('List error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

