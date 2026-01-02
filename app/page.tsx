import WelcomeForm from "@/components/WelcomeForm";
import NotificationPopup from "@/components/NotificationPopup";
import { Suspense } from "react";

export default function Page() {
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
        </div>
      </header>
      <div className="flex-1 w-full">
        <div className="max-w-5xl mx-auto px-4 py-10 md:py-16 pb-32">
          <WelcomeForm />
        </div>
      </div>
    </main>
  );
}
