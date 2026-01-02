// TODO: Move these to environment variables (process.env)
// .env.local:
// NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
// VAPID_PRIVATE_KEY=...

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BBcZj1XW-QVyvCSReRKtZQg2d1gAmtUrSs3_SWLiuRFlUViYe-GrMx_D-oCbwzKsKYDAIQ2vQ0IME6mIDuw6kX8';
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'Tk7RO21Z9ojw0fLfF530gb4r0zfK-X0YMZBcepE0D0U';
export const VAPID_SUBJECT = process.env.NEXT_PUBLIC_VAPID_SUBJECT || 'mailto:example@yourdomain.org';


