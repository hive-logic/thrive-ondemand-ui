'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function NotificationPopup() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const processedRef = useRef<string | null>(null);

  useEffect(() => {
    // URL'den 'notification_msg' parametresini al
    const msg = searchParams.get('notification_msg');
    
    // Eğer mesaj varsa ve daha önce işlemediysek (veya farklı bir mesajsa)
    if (msg && msg !== processedRef.current) {
      try {
        const decoded = decodeURIComponent(msg);
        setMessage(decoded);
        processedRef.current = msg; // Bu mesajı işledik olarak işaretle
        
        // ÖNEMLİ: Mesajı aldık, şimdi URL'i temizleyelim ki refresh'te tekrar çıkmasın
        // Ama router.replace() kullanırsak sayfa yenilenir, bu yüzden sadece window.history kullanabiliriz
        // veya olduğu gibi bırakabiliriz. Şimdilik state'e aldığımız için sorun yok.
        
      } catch (e) {
        setMessage(msg);
      }
    }
  }, [searchParams]);

  const handleClose = () => {
    setMessage(null);
    processedRef.current = null;
    
    // URL'den parametreyi temizle VE sayfayı yenile/tetikle
    // Bu sayede WelcomeForm'daki "hasNotification" engeli kalkacak ve yönlendirme çalışacak.
    const url = new URL(window.location.href);
    url.searchParams.delete('notification_msg');
    
    // window.location.href ile tam bir yönlendirme yapıyoruz ki WelcomeForm baştan çalışsın
    window.location.href = url.toString();
  };

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#2C2C2E] px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <h3 className="text-white font-medium text-sm">New Notification</h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-200 text-base leading-relaxed">
            {message}
          </p>
        </div>

        {/* Footer / Actions */}
        <div className="px-4 py-3 bg-[#2C2C2E]/50 border-t border-white/5 flex justify-end">
          <button
            onClick={handleClose}
            className="bg-white text-black px-6 py-2 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

