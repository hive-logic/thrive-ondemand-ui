"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { checkActivityValidity, ActivityStatus } from "@/lib/activity";

const ChatWindow = dynamic(() => import("@/components/ChatWindow"), {
  ssr: false,
});

export default function ChatGate() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ActivityStatus | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const act = (searchParams.get("activity") || "").trim();
      if (!act) {
        if (!cancelled) setStatus("invalid");
        return;
      }
      const result = await checkActivityValidity(act);
      if (!cancelled) {
        setStatus(result);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (status === "checking") {
    return <div className="text-white/70 text-sm">Checking event status…</div>;
  }

  if (status === "not_active") {
    return (
      <div className="card mx-4 p-6 md:p-8 text-center space-y-3">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-200">
          <span className="text-lg leading-none">!</span>
        </div>
        <div className="space-y-1">
          <h2 className="text-base md:text-lg font-semibold text-white">
            This event is not currently active
          </h2>
          <p className="text-xs md:text-sm text-white/70">
            Please contact the event organizer or try again later.
          </p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="card mx-4 p-6 md:p-8 text-center space-y-3">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-200">
          <span className="text-lg leading-none">!</span>
        </div>
        <div className="space-y-1">
          <h2 className="text-base md:text-lg font-semibold text-white">
            There’s no such event.
          </h2>
          <p className="text-xs md:text-sm text-white/70">
            The link or QR code seems incorrect. Please check it and try again.
          </p>
        </div>
      </div>
    );
  }

  return <ChatWindow />;
}


