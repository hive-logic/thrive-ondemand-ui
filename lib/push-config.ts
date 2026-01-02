// VAPID Keys
// Bu keyler .env dosyasından gelmeli.
// Frontend sadece Public Key'e ihtiyaç duyar.

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
export const VAPID_SUBJECT = 'mailto:admin@thrive.com';

// Private key frontend'de asla kullanılmamalı/bulunmamalıdır.
// Sadece backend (Uğur) tarafında kullanılır.
