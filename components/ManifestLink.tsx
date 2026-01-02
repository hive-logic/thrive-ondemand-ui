'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export default function ManifestLink() {
  const searchParams = useSearchParams();
  const activity = searchParams.get('activity');

  useEffect(() => {
    // Mevcut manifest linkini bul veya oluştur
    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }

    // URL'i güncelle
    // Eğer activity varsa, manifest URL'ine ekle
    const manifestUrl = activity 
      ? `/api/manifest?activity=${encodeURIComponent(activity)}`
      : '/api/manifest'; // Parametresiz (default)

    link.href = manifestUrl;
    
  }, [activity]);

  return null; // Görsel bir şey render etmez
}

