import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import IOSInstallPrompt from '@/components/IOSInstallPrompt';
import ManifestLink from '@/components/ManifestLink';
import PushNotificationManager from '@/components/PushNotificationManager';
import { Suspense } from 'react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Thrive OnDemand',
  description: 'Welcome and chat experience launched via QR',
  // Manifest'i buradan kaldırdık, Client Component ile ekliyoruz
  icons: {
    icon: '/icon.png',
    apple: '/icon.png'
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Thrive'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f0f10',
  viewportFit: 'cover'
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Suspense fallback={null}>
          <ManifestLink />
        </Suspense>
        <PushNotificationManager />
        <IOSInstallPrompt />
        <div className="min-h-screen">{props.children}</div>
      </body>
    </html>
  );
}



