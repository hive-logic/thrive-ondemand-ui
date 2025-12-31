'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function NotificationPopup() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // URL'den 'notification_msg' parametresini al
    const msg = searchParams.get('notification_msg');
    if (msg) {
      // Decode et (türkçe karakterler vs için)
      try {
        setMessage(decodeURIComponent(msg));
      } catch (e) {
        setMessage(msg);
      }
    }
  }, [searchParams]);

  const handleClose = () => {
    setMessage(null);
    // URL'den parametreyi temizle (sayfa yenilenince tekrar çıkmasın diye)
    const newUrl = window.location.pathname;
    router.replace(newUrl);
  };

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-scale-up">
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

