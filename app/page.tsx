"use client";

import WelcomeForm from "@/components/WelcomeForm";
import NotificationPopup from "@/components/NotificationPopup";
import LoginModal from "@/components/LoginModal";
import { useAuth } from "@/components/AuthContext";
import { useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";

export default function Page() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const router = useRouter();
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleLoginSuccess = () => {
    router.replace("/dashboard");
  };

  return (
    <main className="h-[100dvh] flex flex-col bg-black text-white overflow-y-auto overscroll-none pt-safe">
      {/* useSearchParams kullandığı için Suspense içine almalıyız */}
      <Suspense fallback={null}>
        <NotificationPopup />
      </Suspense>
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-black/20 border-b border-white/10 shrink-0">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm text-white/80">Thrive</span>
          </div>

          {/* Login / User section */}
          <div>
            {isLoading ? (
              <div className="w-16 h-8" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/70 hidden sm:inline">
                  {user.first_name || user.email}
                </span>
                <button
                  onClick={() => {
                    logout();
                  }}
                  className="text-sm px-3 py-1.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="text-sm px-4 py-1.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition-colors hover:bg-white/5"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 w-full">
        <div className="max-w-5xl mx-auto px-4 py-10 md:py-16 pb-32">
          <WelcomeForm />
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />
    </main>
  );
}
