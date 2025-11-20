"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { loadSession, saveSession, UserSession } from "@/lib/session";
import { getLocationWithAddress } from "@/lib/geolocation";
import { useRouter } from "next/navigation";
import { checkActivityValidity, ActivityStatus } from "@/lib/activity";

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function EventStatusCard({
  title,
  message,
  tone,
}: {
  title: string;
  message: string;
  tone: "warning" | "error";
}) {
  const toneClasses =
    tone === "warning"
      ? "bg-amber-500/10 border-amber-400/40 text-amber-200"
      : "bg-red-500/10 border-red-400/40 text-red-200";

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="card p-6 md:p-8 text-center space-y-4">
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border ${toneClasses}`}
        >
          <span className="text-xl leading-none">!</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg md:text-xl font-semibold text-white">
            {title}
          </h2>
          <p className="text-sm md:text-[15px] text-white/70">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function WelcomeForm() {
  const router = useRouter();
  const existing = useMemo(() => loadSession(), []);
  const nameId = useId();
  const emailId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [activityStatus, setActivityStatus] =
    useState<ActivityStatus | "checking">("checking");
  const [activityId, setActivityId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const params = new URLSearchParams(window.location.search);
        const act = (params.get("activity") || "").trim();
        if (!act) {
          if (!cancelled) {
            setActivityStatus("invalid");
          }
          return;
        }
        if (!cancelled) {
          setActivityId(act);
        }
        const status = await checkActivityValidity(act);
        if (cancelled) return;
        setActivityStatus(status);
        if (status === "active" && existing) {
          router.replace(`/chat?activity=${encodeURIComponent(act)}`);
        }
      } catch {
        if (!cancelled) {
          setActivityStatus("invalid");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [existing, router]);

  const disabled =
    !name.trim() || name.trim().length < 2 || !validateEmail(email) || submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || activityStatus !== "active" || !activityId) return;
    setSubmitting(true);
    setLocationError(null);

    try {
      window.localStorage.setItem("activity_id", activityId);
    } catch {}

    const location = await getLocationWithAddress(email);
    if (!location) {
      setSubmitting(false);
      setLocationError("Location permission is required to continue.");
      return;
    }
    const session: UserSession = {
      session_id: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim(),
      createdAt: Date.now(),
      location,
    };
    saveSession(session);
    router.replace(`/chat?activity=${encodeURIComponent(activityId)}`);
  }

  if (activityStatus === "checking") {
    return (
      <div className="w-full max-w-xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">Welcome</h1>
        </div>
        <div className="card p-5 md:p-6 flex items-center justify-center text-white/70">
          Checking event status…
        </div>
      </div>
    );
  }

  if (activityStatus === "not_active") {
    return (
      <EventStatusCard
        title="This event is not currently active"
        message="Please contact the event organizer or try scanning the QR code again later."
        tone="warning"
      />
    );
  }

  if (activityStatus === "invalid") {
    return (
      <EventStatusCard
        title="There’s no such event."
        message="The link or QR code seems incorrect. Please check it and try again."
        tone="error"
      />
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Welcome</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 md:p-6 space-y-5">
        <div className="space-y-2">
          <label className="text-xs text-white/70" htmlFor={nameId}>
            Full name
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M21 22a9 9 0 1 0-18 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., John Doe"
              autoFocus
              autoComplete="name"
              className="w-full rounded-xl bg-[#141415] border border-white/10 pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/40 caret-primary text-[16px] leading-6 appearance-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-white/70" htmlFor={emailId}>
            Email
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M3 7.5a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M4 7l8 6 8-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@domain.com"
              autoComplete="email"
              className="w-full rounded-xl bg-[#141415] border border-white/10 pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-accent/40 caret-accent text-[16px] leading-6 appearance-none"
              aria-invalid={!!email && !validateEmail(email)}
            />
          </div>
          {email && !validateEmail(email) && (
            <p className="text-xs text-red-400">Please enter a valid email address.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all bg-gradient-to-tr from-primary to-accent hover:brightness-110 shadow-[0_10px_25px_rgba(233,66,108,0.25)]"
        >
          {submitting ? 'Saving…' : 'Start chat'}
        </button>

        <p className="text-xs text-white/60 text-center">We will collect your location.</p>
        {locationError && (
          <p className="text-xs text-red-400 text-center">{locationError}</p>
        )}
      </form>
    </div>
  );
}



