"use client";

import { Suspense } from "react";
import ChatGate from "./ChatGate";

export default function ChatPage() {
  return (
    <main className="h-screen-fixed flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        <div className="max-w-5xl mx-auto px-0 md:px-4 py-0 h-full min-h-0">
          <div className="h-full overflow-hidden relative rounded-none border border-white/10 md:border-0 md:rounded-2xl md:gradient-border md:bg-[#1b1b1c] flex items-center justify-center">
            <Suspense
              fallback={
                <div className="text-white/70 text-sm">Checking event status…</div>
              }
            >
              <ChatGate />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
