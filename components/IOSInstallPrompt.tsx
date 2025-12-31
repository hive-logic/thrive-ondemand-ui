'use client';

import { useState, useEffect } from 'react';

export default function IOSInstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 1. Check if device is iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // 2. Check if app is in standalone mode (added to home screen)
    // @ts-ignore
    const isStandaloneMode = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(isStandaloneMode);

    // 3. Show prompt only if iOS AND NOT standalone
    if (isIosDevice && !isStandaloneMode) {
      // Check if user dismissed it before (optional - storing in localStorage)
      const hasDismissed = localStorage.getItem('iosPromptDismissed');
      if (!hasDismissed) {
        setShowPrompt(true);
      }
    }
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg z-50 animate-slide-up text-black safe-area-pb">
      <div className="max-w-md mx-auto relative">
        <button 
          onClick={() => {
            setShowPrompt(false);
            localStorage.setItem('iosPromptDismissed', 'true');
          }}
          className="absolute top-0 right-0 p-2 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
        
        <div className="flex items-start gap-4 pr-8">
          <div className="bg-gray-100 p-2 rounded-lg shrink-0">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          
          <div>
            <h3 className="font-semibold text-sm mb-1">Install App for Notifications</h3>
            <p className="text-xs text-gray-600 mb-2">
              To receive notifications, add this app to your Home Screen:
            </p>
            <ol className="text-xs text-gray-600 space-y-1 ml-4 list-decimal">
              <li>Tap the <span className="font-bold">Share</span> button below <span className="inline-block align-middle"><svg className="w-4 h-4 text-blue-600 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg></span></li>
              <li>Select <span className="font-bold">Add to Home Screen</span> <span className="inline-block align-middle">➕</span></li>
            </ol>
          </div>
        </div>
        
        {/* Pointer arrow pointing to the share button area on iOS Safari */}
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 transform border-r border-b hidden sm:block"></div>
      </div>
    </div>
  );
}

