import { NextResponse } from 'next/server';
import redis from '@/lib/redis';

export async function POST() {
  try {
    await redis.flushdb();
    return NextResponse.json({ message: 'Redis cleared' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear' }, { status: 500 });
  }
}

