import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // REDIS DEVRE DIŞI BIRAKILDI (Uğur'un Backend'ine geçiş için)
    // Burası artık sadece log basıyor. Gerçek entegrasyonda burası
    // ya direkt Uğur'un endpoint'ine proxy olacak ya da bu route silinecek.
    
    console.log('--- MOCK SUBSCRIPTION RECEIVED ---');
    console.log('Activity ID:', body.activity_id);
    console.log('User:', body.user);
    console.log('Subscription:', body.subscription);
    console.log('----------------------------------');

    return NextResponse.json({ success: true, message: 'Redis removed. Ready for backend integration.' });
  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
