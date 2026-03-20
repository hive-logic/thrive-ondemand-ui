"use client";

import WelcomeForm from "@/components/WelcomeForm";
import NotificationPopup from "@/components/NotificationPopup";
import LoginModal from "@/components/LoginModal";
import { useAuth } from "@/components/AuthContext";
import { useRouter } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import Image from "next/image";


export default function Page() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const router = useRouter();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [hasActivity, setHasActivity] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check if URL has activity param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const act = (params.get("activity") || "").trim();
    setHasActivity(!!act);
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  // Force video to always play — mobile browsers sometimes pause it
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const forcePlay = () => {
      vid.play().catch(() => {});
    };
    vid.addEventListener("pause", forcePlay);
    vid.addEventListener("ended", forcePlay);
    // Also try to play on visibility change (e.g. tab switch)
    const onVisChange = () => {
      if (document.visibilityState === "visible") forcePlay();
    };
    document.addEventListener("visibilitychange", onVisChange);
    // Initial kick
    forcePlay();
    return () => {
      vid.removeEventListener("pause", forcePlay);
      vid.removeEventListener("ended", forcePlay);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, []);

  const handleLoginSuccess = () => {
    router.replace("/dashboard");
  };

  return (
    <main className="relative min-h-[100dvh] flex flex-col text-white overflow-x-hidden">

      {/* ── Video background (hero only) ── */}
      <div className="fixed inset-0 -z-10">
        <video
          ref={videoRef}
          autoPlay muted loop playsInline
          controls={false}
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          src="/video.mp4"
          /* @ts-ignore */
          webkit-playsinline="true"
        />
        {/* Dark base overlay */}
        <div className="absolute inset-0 bg-black/60" />
        {/* Brand gradient pulse */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(233,66,108,0.35) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* ── Notification popup ── */}
      <Suspense fallback={null}>
        <NotificationPopup />
      </Suspense>

      {/* ── Header ── */}
      <header className="relative z-10 shrink-0 px-5 pt-safe">
        <div className="max-w-2xl mx-auto h-16 flex items-center justify-between">
          <Image
            src="/thrive_logo.png"
            alt="ThriveLogic"
            width={148}
            height={44}
            priority
            className="object-contain drop-shadow-lg"
          />
          <div>
            {isLoading ? (
              <div className="w-16 h-8" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/70 hidden sm:inline">
                  {user.first_name || user.email}
                </span>
                <button
                  onClick={() => logout()}
                  className="text-sm px-3 py-1.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="text-sm px-4 py-1.5 rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5 transition-colors"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 shrink-0 px-5 pt-10 pb-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-semibold mb-3">
          AI-Powered Security Platform
        </p>
        <h1 className="text-[32px] sm:text-[40px] font-extrabold leading-tight tracking-tight drop-shadow-md">
          Enterprise Security,{" "}
          <span
            className="text-transparent bg-clip-text"
            style={{
              backgroundImage: "linear-gradient(90deg, #E9426C 0%, #8B5CF6 100%)",
            }}
          >
            Made Simple.
          </span>
        </h1>
        <p className="mt-3 text-[14px] text-white/60 max-w-sm mx-auto leading-relaxed">
          VARCA is ThriveLogic&apos;s on-site AI agent, giving event attendees,
          visitors and security teams a single intelligent interface for
          everything that matters.
        </p>

        {/* CTA */}
        <div className="mt-6 flex items-center justify-center">
          <a
            href="https://thrivelogic.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[14px] transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #E9426C 0%, #8B5CF6 100%)",
              boxShadow: "0 8px 24px rgba(233,66,108,0.35)",
            }}
          >
            <span>Discover ThriveLogic</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </section>

      {/* ── WelcomeForm (only shown when ?activity= param present) ── */}
      <div className="relative z-10 px-4 pb-6">
        <Suspense fallback={null}>
          <WelcomeForm />
        </Suspense>
      </div>

      {/* ── Footer ── */}
      <footer className="relative z-10 shrink-0 px-4 py-5 text-center pb-safe">
        <p className="text-[10px] text-white/25 tracking-wide">
          © {new Date().getFullYear()} ThriveLogic · Powered by VARCA AI
        </p>
      </footer>

      {/* ── Login Modal ── */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />
    </main>
  );
}
