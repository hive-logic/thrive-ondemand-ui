"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSession, UserSession } from "@/lib/session";
import { getLocationWithAddress, requestUserLocation, Coordinates } from "@/lib/geolocation";
import { useRouter } from "next/navigation";
import { getWS, getActivityIdFromUrl, isWSOpen, subscribeWS, clearPublicUserData } from "@/lib/ws";
import MarkdownMessage from "@/components/MarkdownMessage";

type MessageAttachment = {
  type: "image" | "video";
  url: string;
  fileName: string;
};

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  attachment?: MessageAttachment;
  failed?: boolean;
};

type PendingAttachment = MessageAttachment & {
  file: File;
};

type AlertState =
  | {
    kind: "alert";
    title?: string;
    message: string;
  }
  | {
    kind: "camera-choice";
    title?: string;
    message: string;
  };

type MessageBubbleProps = {
  msg: Message;
  isLast: boolean;
  onRetry?: () => void;
};

const MessageBubble = memo(
  function MessageBubble(props: MessageBubbleProps) {
    const isUser = props.msg.role === "user";
    return (
      <div
        className={`flex ${isUser ? "justify-end" : "justify-start"} ${props.isLast ? "message-in" : ""
          }`}
      >
        {/* Retry icon for failed user messages */}
        {isUser && props.msg.failed && (
          <button
            onClick={props.onRetry}
            className="flex items-center justify-center w-8 h-8 mr-2 self-center rounded-full bg-red-600/80 hover:bg-red-500 transition-colors shrink-0"
            title="Tap to retry"
            aria-label="Retry sending message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        )}
        <div
          className={`max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl border backdrop-blur ${isUser
            ? props.msg.failed
              ? "bg-red-900/50 text-white/70 border-red-500/50 shadow-[0_8px_20px_rgba(220,38,38,0.25)]"
              : "bg-primary text-white border-transparent shadow-[0_8px_20px_rgba(233,66,108,0.35)]"
            : "bg-white/5 text-white/90 border-white/10 shadow-[0_6px_18px_rgba(76,0,255,0.16)]"
            }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{props.msg.content}</p>
          ) : (
            <MarkdownMessage content={props.msg.content} />
          )}
          {props.msg.attachment && (
            <div className="mt-2 space-y-1">
              {props.msg.attachment.type === "image" && (
                <img
                  src={props.msg.attachment.url}
                  alt={props.msg.attachment.fileName || "Captured image"}
                  className="max-w-full rounded-xl border border-white/10"
                />
              )}
              {props.msg.attachment.type === "video" && (
                <video
                  controls
                  playsInline
                  src={props.msg.attachment.url}
                  className="max-w-full rounded-xl border border-white/10"
                />
              )}
              <p className="text-[11px] text-white/60 truncate">
                {props.msg.attachment.fileName}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) => prev.msg === next.msg && prev.isLast === next.isLast && prev.onRetry === next.onRetry
);

const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex justify-start message-in">
      <div className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot" />
          <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
          <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>
    </div>
  );
});

export default function ChatWindow() {
  const router = useRouter();
  const session = useMemo<UserSession | null>(() => loadSession(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recordingVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const streamMsgIdRef = useRef<string | null>(null);
  const tokenQueueRef = useRef<string[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const flushCompletePendingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [connected, setConnected] = useState(false);
  // SOS button state
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const sosTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sosTriggeredRef = useRef(false);

  // SOS category grid state
  const [showSOSGrid, setShowSOSGrid] = useState(false);
  const [sosCatCountdown, setSosCatCountdown] = useState<number | null>(null);
  const [activeSosCat, setActiveSosCat] = useState<string | null>(null);
  const sosCatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sosCatTriggeredRef = useRef(false);
  const sosLocationRef = useRef<Coordinates | null>(null);

  // ── Speech-to-Text state ──
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const sendLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendWasLongPress = useRef(false);

  // Keep ref in sync with state
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const SOS_CATEGORIES = [
    { key: "fire", icon: "🔥", label: "Fire", color: "red" },
    { key: "active_shooter", icon: "🔫", label: "Active Shooter", color: "red" },
    { key: "bomb_threat", icon: "💣", label: "Bomb Threat", color: "red" },
    { key: "intrusion", icon: "🚨", label: "Intrusion", color: "orange" },
    { key: "fall_medical", icon: "🏥", label: "Medical", color: "yellow" },
    { key: "gas_leak", icon: "☁️", label: "Gas Leak", color: "orange" },
    { key: "hazmat_spill", icon: "☢️", label: "Hazmat Spill", color: "orange" },
    { key: "evacuation", icon: "🏃", label: "Evacuation", color: "yellow" },
    { key: "general_alert", icon: "⚠️", label: "General Alert", color: "red" },
  ];
  const scrollRef = useRef<HTMLDivElement>(null);
  const locationText = useMemo(() => {
    if (!session?.location) return null;
    if (
      session.location.formatted &&
      session.location.formatted.trim().length > 0
    ) {
      return session.location.formatted;
    }
    const lat = session.location.latitude.toFixed(5);
    const lon = session.location.longitude.toFixed(5);
    return `${lat}, ${lon}`;
  }, [session]);
  const userMeta = useMemo(() => {
    if (!session) return undefined;
    return {
      name: session.name,
      email: session.email,
      createdAt: session.createdAt,
      location: session.location,
    };
  }, [session]);

  // Remote WS kullanılacağı için dev initializer'a gerek yok

  useEffect(() => {
    if (!session) {
      // Kullanıcı doğrudan /chat?activity=... ile geldiyse,
      // activity parametresini koruyarak form sayfasına geri yönlendir.
      const activityId = getActivityIdFromUrl();
      const target = activityId
        ? `/?activity=${encodeURIComponent(activityId)}`
        : "/";
      router.replace(target);
      return;
    }
    const firstName = session.name.split(" ")[0] || session.name;
    const welcome = `👋 **Hey ${firstName}!** I'm VARCA — your smart on-site assistant for this event.

Here's what you can ask me:

- 📍 **Event info** — schedule, location, what's happening
- 🎤 **Speakers & sessions** — who's presenting and when
- 🍽️ **Food, drinks & facilities** — where to find everything
- 🚨 **Safety & emergencies** — who to contact, what to do
- 💡 **Anything else** — I'm here to help!

What's on your mind?`;

    setMessages([
      {
        id: "m1",
        role: "assistant",
        content: welcome,
      },
    ]);
  }, [router, session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Also scroll when typing indicator appears
  useEffect(() => {
    if (sending) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50); // small delay to let the indicator render first
    }
  }, [sending]);

  // JSON + binary paketlemek için yardımcılar
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unexpected FileReader result"));
          return;
        }
        const commaIndex = result.indexOf(",");
        if (commaIndex >= 0) {
          resolve(result.substring(commaIndex + 1));
        } else {
          resolve(result);
        }
      };
      reader.onerror = () =>
        reject(reader.error || new Error("FileReader error"));
      reader.readAsDataURL(file);
    });
  }

  function getPreferredRecorderConfig():
    | { mimeType: string; extension: "mp4" | "webm" }
    | { mimeType?: undefined; extension: "mp4" | "webm" } {
    if (typeof window === "undefined") {
      return { extension: "webm" };
    }
    const nav = window.navigator;
    const ua = nav?.userAgent || "";
    const isAppleDevice =
      /iPad|iPhone|iPod/.test(ua) ||
      (nav?.platform === "MacIntel" && (nav as any).maxTouchPoints > 1);

    const MR: any = (window as any).MediaRecorder;
    const canCheck = MR && typeof MR.isTypeSupported === "function";

    if (isAppleDevice && canCheck) {
      // Try specific codecs first for better compatibility
      const appleCandidates = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
      ];
      for (const c of appleCandidates) {
        try {
          if (MR.isTypeSupported(c)) {
            return { mimeType: c, extension: "mp4" };
          }
        } catch {
          // ignore
        }
      }
      return { extension: "mp4" };
    }

    if (canCheck) {
      const webmCandidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      for (const c of webmCandidates) {
        try {
          if (MR.isTypeSupported(c)) {
            return { mimeType: c, extension: "webm" };
          }
        } catch {
          // ignore and continue
        }
      }
    }

    return { extension: "webm" };
  }

  async function sendBinaryVideoOverWS(
    ws: WebSocket,
    file: File,
    metadata: {
      message: string;
      activity_id: string;
      session_id: string | null;
      time: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user_meta?: any;
    }
  ) {
    const jsonString = JSON.stringify(metadata);
    const jsonBytes = new TextEncoder().encode(jsonString);
    const videoBytes = await file.arrayBuffer();

    const totalLength = 4 + jsonBytes.length + videoBytes.byteLength;
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);

    // İlk 4 byte: JSON'un uzunluğu (Big Endian)
    view.setUint32(0, jsonBytes.length, false);

    const byteView = new Uint8Array(buffer);
    byteView.set(jsonBytes, 4);
    byteView.set(new Uint8Array(videoBytes), 4 + jsonBytes.length);

    ws.send(buffer);
  }

  function openAlert(message: string, title?: string) {
    setAlertState({ kind: "alert", message, title });
  }

  function closeAlert() {
    setAlertState(null);
  }

  function stopAndCleanupRecording() {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    const videoEl = recordingVideoRef.current;
    if (videoEl) {
      videoEl.srcObject = null;
    }
    setIsRecording(false);
    setIsCameraOpen(false);
  }

  async function openCameraPreview() {
    setRecordingError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setRecordingError("Camera access is not supported on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: true,
      });
      mediaStreamRef.current = stream;
      setIsCameraOpen(true);
      setIsRecording(false);
    } catch (err) {
      // Try again without audio (microphone permission might be denied)
      try {
        // eslint-disable-next-line no-console
        console.warn("Camera+Audio access failed, trying video only:", err);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        mediaStreamRef.current = stream;
        setIsCameraOpen(true);
        setIsRecording(false);
        // Optionally warn user that audio is disabled?
      } catch (err2) {
        // eslint-disable-next-line no-console
        console.error("Camera access failed:", err2);
        stopAndCleanupRecording();
        setRecordingError("Could not access the camera. Please check permissions.");
      }
    }
  }

  async function startCustomVideoRecording() {
    setRecordingError(null);
    if (!mediaStreamRef.current) {
      await openCameraPreview();
      if (!mediaStreamRef.current) return;
    }

    try {
      const stream = mediaStreamRef.current;
      if (!stream) {
        setRecordingError("Camera stream is not available.");
        return;
      }

      const recConfig = getPreferredRecorderConfig();
      let recorder: MediaRecorder;
      try {
        if (recConfig.mimeType) {
          recorder = new MediaRecorder(stream, {
            mimeType: recConfig.mimeType,
          });
        } else {
          recorder = new MediaRecorder(stream);
        }
      } catch {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        stopAndCleanupRecording();

        if (chunks.length === 0) {
          setIsRecording(false);
          return;
        }

        const effectiveType =
          recorder.mimeType || recConfig.mimeType || "video/webm";
        const blob = new Blob(chunks, { type: effectiveType });
        const MAX_BYTES = 10 * 1024 * 1024;
        if (blob.size > MAX_BYTES) {
          openAlert(
            "Recorded video exceeds the 10MB limit. Please record a shorter or lower-resolution video.",
            "Video too large"
          );
          setIsRecording(false);
          return;
        }

        const fileName = `recorded-${Date.now()}.${recConfig.extension === "mp4" ? "mp4" : "webm"
          }`;
        const file = new File([blob], fileName, {
          type: blob.type || effectiveType,
        });
        const url = URL.createObjectURL(blob);

        setPendingAttachment((prev) => {
          if (prev?.url) {
            try {
              URL.revokeObjectURL(prev.url);
            } catch {
              // ignore
            }
          }
          const next: PendingAttachment = {
            type: "video",
            url,
            fileName,
            file,
          };
          setIsPreviewOpen(true);
          return next;
        });
        setIsRecording(false);
      };

      recorder.start();
      setIsRecording(true);
      setIsCameraOpen(true);

      if (recordingTimeoutRef.current !== null) {
        window.clearTimeout(recordingTimeoutRef.current);
      }
      // Use a small safety buffer above 4s to compensate for
      // scheduling/encoding overhead so the actual clip duration
      // is as close as possible to 4 seconds (not ~3s).
      const AUTO_STOP_MS = 4300;
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          try {
            mediaRecorderRef.current.stop();
          } catch {
            // ignore
          }
        }
      }, AUTO_STOP_MS);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Camera access failed:", err);
      stopAndCleanupRecording();
      setRecordingError("Could not access the camera. Please check permissions.");
    }
  }

  function handleStopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
  }

  function handleCloseCamera() {
    if (isRecording) {
      handleStopRecording();
      return;
    }
    stopAndCleanupRecording();
    setIsCameraOpen(false);
  }

  function getVideoDuration(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.playsInline = true;
      video.muted = true;

      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };

      video.onloadedmetadata = () => {
        const duration = video.duration;
        cleanup();
        resolve(duration);
      };

      video.onerror = () => {
        cleanup();
        reject(new Error("Failed to load video metadata"));
      };

      video.src = url;
    });
  }

  function sendQuickAction(text: string) {
    if (!isWSOpen() || sending) return;
    setShowQuickActions(false);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    setMessages((m) => [...m, userMsg]);

    const ws = getWS();
    const payload = {
      activity_id: getActivityIdFromUrl(),
      session_id: session?.session_id ?? null,
      message: text,
      time: new Date().toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" }),
      user_meta: userMeta,
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      setSending(true);
    }
  }

  /** Send a message to WS without showing it in the chat UI */
  function sendHiddenMessage(text: string, overrideUserMeta?: typeof userMeta) {
    if (!isWSOpen()) return;
    const ws = getWS();
    const payload = {
      activity_id: getActivityIdFromUrl(),
      session_id: session?.session_id ?? null,
      message: text,
      time: new Date().toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" }),
      user_meta: overrideUserMeta ?? userMeta,
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      setSending(true);
    }
  }

  /** Retry sending a failed user message */
  function retryMessage(msgId: string) {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || !msg.failed) return;

    // Clear the failed flag
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, failed: false } : m))
    );

    // Resend via WS
    const ws = getWS();
    const payload = {
      activity_id: getActivityIdFromUrl(),
      session_id: session?.session_id ?? null,
      message: msg.content,
      time: new Date().toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" }),
      user_meta: userMeta,
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      setSending(true);
    }
  }

  // SOS press-and-hold handlers
  function handleSOSStart() {
    if (sosTimerRef.current) return;
    sosTriggeredRef.current = false;
    setSosCountdown(5);
    let count = 5;
    sosTimerRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        // Show SOS category grid — refresh GPS first
        handleSOSClear();
        sosTriggeredRef.current = true;
        setSosCountdown(null);
        // Refresh GPS in background, then show grid
        getLocationWithAddress(session?.email, 6000).then((loc) => {
          sosLocationRef.current = loc;
        });
        setShowSOSGrid(true);
      } else {
        setSosCountdown(count);
      }
    }, 1000);
  }

  function handleSOSClear() {
    if (sosTimerRef.current) {
      clearInterval(sosTimerRef.current);
      sosTimerRef.current = null;
    }
    if (!sosTriggeredRef.current) {
      setSosCountdown(null);
    }
  }

  // SOS category hold-to-confirm handlers
  function handleCatStart(catKey: string) {
    if (sosCatTimerRef.current) return;
    sosCatTriggeredRef.current = false;
    setActiveSosCat(catKey);
    setSosCatCountdown(3);
    let count = 3;
    sosCatTimerRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        handleCatClear();
        sosCatTriggeredRef.current = true;
        setSosCatCountdown(null);
        setActiveSosCat(null);
        setShowSOSGrid(false);
        const cat = SOS_CATEGORIES.find((c) => c.key === catKey);
        const label = cat?.label || catKey;
        // Use fresh GPS location (refreshed on SOS trigger) or fall back to session location
        const loc = sosLocationRef.current || session?.location;
        let locationInfo = "";
        if (loc) {
          if (loc.formatted && loc.formatted.trim()) {
            locationInfo = ` [Location: ${loc.formatted}]`;
          } else if (loc.latitude && loc.longitude) {
            locationInfo = ` [Location: ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}]`;
          }
        }
        // Build fresh user_meta with updated GPS for the WS payload
        const freshUserMeta = userMeta ? {
          ...userMeta,
          location: loc ?? userMeta.location,
        } : userMeta;
        sendHiddenMessage(`###sos###${label}: I need help!${locationInfo}`, freshUserMeta);
      } else {
        setSosCatCountdown(count);
      }
    }, 1000);
  }

  function handleCatClear() {
    if (sosCatTimerRef.current) {
      clearInterval(sosCatTimerRef.current);
      sosCatTimerRef.current = null;
    }
    if (!sosCatTriggeredRef.current) {
      setSosCatCountdown(null);
      setActiveSosCat(null);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text && !pendingAttachment) return;
    if (!isWSOpen()) {
      // prevent sending while disconnected
      return;
    }

    setInput("");
    // Reset textarea height after send
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setShowQuickActions(false);
    const attachmentToSend = pendingAttachment;
    if (attachmentToSend) {
      setPendingAttachment(null);
    }

    const attachmentForMessage: MessageAttachment | undefined =
      attachmentToSend
        ? {
          type: attachmentToSend.type,
          url: attachmentToSend.url,
          fileName: attachmentToSend.fileName,
        }
        : undefined;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content:
        text ||
        (attachmentToSend
          ? attachmentToSend.type === "image"
            ? "Photo"
            : "Video"
          : ""),
      attachment: attachmentForMessage,
    };
    setMessages((m) => [...m, userMsg]);

    const ws = getWS();

    // Refresh GPS location (3s timeout, non-blocking on failure)
    let freshLocation: any = userMeta?.location;
    try {
      const coords = await requestUserLocation(3000);
      if (coords) freshLocation = { latitude: coords.latitude, longitude: coords.longitude };
    } catch { /* GPS unavailable — use stale location */ }

    const basePayload = {
      activity_id: getActivityIdFromUrl(),
      session_id: session?.session_id ?? null,
      message: text,
      time: new Date().toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" }),
      user_meta: { ...userMeta, location: freshLocation },
    };
    // eslint-disable-next-line no-console
    console.log("WS send base payload:", basePayload, {
      hasAttachment: !!attachmentToSend,
      readyState: ws.readyState,
    });

    const sendJsonPayload = (payload: unknown) => {
      const json = JSON.stringify(payload);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
        setSending(true);
      } else {
        ws.onopen = () => {
          // eslint-disable-next-line no-console
          console.log("WS onopen -> sending JSON payload now");
          ws.send(json);
          setSending(true);
        };
      }
    };

    try {
      if (attachmentToSend && attachmentToSend.type === "image") {
        // For images: send base64 inside JSON
        const base64 = await fileToBase64(attachmentToSend.file);
        const payload = {
          ...basePayload,
          media: {
            type: "image",
            content: base64,
          },
        };
        sendJsonPayload(payload);
      } else if (attachmentToSend && attachmentToSend.type === "video") {
        // For video: JSON + binary packing like sample.js
        const sendBinary = async () => {
          await sendBinaryVideoOverWS(ws, attachmentToSend.file, basePayload);
          setSending(true);
        };

        if (ws.readyState === WebSocket.OPEN) {
          await sendBinary();
        } else {
          ws.onopen = () => {
            // eslint-disable-next-line no-console
            console.log("WS onopen -> sending binary video payload now");
            sendBinary().catch((err) => {
              // eslint-disable-next-line no-console
              console.error("Failed to send binary video:", err);
            });
          };
        }
      } else if (text) {
        // Sadece metin
        sendJsonPayload(basePayload);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to send message:", err);
    }
  }

  function handleCameraClick() {
    const canUseCustomRecorder =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      "MediaRecorder" in window;

    if (canUseCustomRecorder) {
      setAlertState({
        kind: "camera-choice",
        title: "Add media",
        message:
          "How would you like to add media? You can take a photo, record a short video (maximum 4 seconds) or upload from your gallery.",
      });
      return;
    }

    // Fallback: use classic file picker (gallery / system camera)
    fileInputRef.current?.click();
  }

  async function handleMediaSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      e.target.value = "";
      return;
    }

    // Size limit: 10MB
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      openAlert(
        "Maximum file size is 10MB. Please select a smaller file.",
        "File too large"
      );
      e.target.value = "";
      return;
    }

    // Release previous preview URL if there was one
    if (pendingAttachment?.url) {
      try {
        URL.revokeObjectURL(pendingAttachment.url);
      } catch {
        // ignore
      }
    }

    const objectUrl = URL.createObjectURL(file);
    const mediaType = isImage ? "image" : "video";

    if (mediaType === "video") {
      try {
        const duration = await getVideoDuration(objectUrl);
        if (duration > 4) {
          openAlert(
            "Video is too long. Maximum allowed duration is 4 seconds.",
            "Video too long"
          );
          URL.revokeObjectURL(objectUrl);
          e.target.value = "";
          return;
        }
      } catch (err) {
        // iOS or some browsers might fail to load metadata for gallery videos immediately.
        // Since we already checked the file size (<= 10MB), we'll be lenient here and
        // allow the video to proceed. The user can verify it in the preview.
        // eslint-disable-next-line no-console
        console.warn("Could not verify video duration, proceeding anyway:", err);
      }
    }

    setPendingAttachment({
      type: mediaType,
      url: objectUrl,
      fileName: file.name,
      file,
    });

    // Open preview immediately after selecting media
    setIsPreviewOpen(true);

    // File is only kept in pending state; it is sent to backend during send.
    e.target.value = "";
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-white/70">
        Loading…
      </div>
    );
  }

  // Keep list pinned appropriately when the virtual keyboard shows/hides
  const keyboardOpen = useRef(false);
  const lastViewportHeight = useRef<number | null>(null);
  useEffect(() => {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (!vv) return;
    const onResize = () => {
      // Only react while keyboard is open, and ignore tiny jitters
      if (!keyboardOpen.current) {
        lastViewportHeight.current = vv.height;
        return;
      }
      const current = vv.height;
      const prev = lastViewportHeight.current;
      lastViewportHeight.current = current;
      if (prev !== null && Math.abs(current - prev) < 8) {
        return;
      }
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    };
    lastViewportHeight.current = vv.height;
    vv.addEventListener("resize", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
    };
  }, []);

  // Keep recording preview video element in sync with active camera stream
  useEffect(() => {
    if (!isCameraOpen && !isRecording) return;
    const stream = mediaStreamRef.current;
    if (!stream) return;
    const videoEl = recordingVideoRef.current;
    if (!videoEl) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (videoEl as any).srcObject = stream;
      void videoEl.play();
    } catch {
      // ignore play/srcObject errors
    }
  }, [isCameraOpen, isRecording]);

  function handleFocus() {
    keyboardOpen.current = true;
    document.documentElement.classList.add("keyboard-open");
  }
  function handleBlur() {
    keyboardOpen.current = false;
    document.documentElement.classList.remove("keyboard-open");
    // ensure state snaps back
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  // ── Speech Recognition helpers ──
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return;
    }
    // Stop any existing session
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { }
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = input; // start from existing input

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + t;
        } else {
          interim = t;
        }
      }
      setInput(finalTranscript + (interim ? ' ' + interim : ''));
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // If still in listening mode, restart (keeps listening until user stops)
      if (isListeningRef.current) {
        try { recognition.start(); } catch { }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
    }
  }, [input, isListening]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { }
      recognitionRef.current = null;
    }
  }, []);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { }
      }
    };
  }, []);

  // Send button long-press handlers
  const handleSendTouchStart = useCallback(() => {
    sendWasLongPress.current = false;
    sendLongPressTimer.current = setTimeout(() => {
      sendWasLongPress.current = true;
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    }, 800); // 800ms long press
  }, [isListening, startListening, stopListening]);

  const handleSendTouchEnd = useCallback(() => {
    if (sendLongPressTimer.current) {
      clearTimeout(sendLongPressTimer.current);
      sendLongPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const ws = getWS();
    setConnected(ws.readyState === WebSocket.OPEN);

    const unsubscribe = subscribeWS({
      onMessage: (event) => {
        // eslint-disable-next-line no-console
        console.log("WS onmessage raw:", event.data);
        try {
          const data = JSON.parse(event.data);
          // eslint-disable-next-line no-console
          console.log("WS onmessage parsed:", data);
          if (data.type !== "message") return;

          // Handle request_retry: mark last user message as failed
          if (data.messageType === "request_retry") {
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].role === "user") {
                  updated[i] = { ...updated[i], failed: true };
                  break;
                }
              }
              return updated;
            });
            setSending(false);
            return;
          }

          // Ensure streaming target exists
          if (!streamMsgIdRef.current) {
            const newId = crypto.randomUUID();
            streamMsgIdRef.current = newId;
            setMessages((prev) => [
              ...prev,
              { id: newId, role: "assistant", content: "" },
            ]);
          }
          // Queue token and start smooth flush
          if (typeof data.content === "string") {
            tokenQueueRef.current.push(data.content);
            scheduleFlush();
          }
          if (data.isComplete) {
            flushCompletePendingRef.current = true;
            scheduleFlush(); // ensure we drain and then finalize
          }
        } catch {
          // düz string gelirse
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: String(event.data),
            },
          ]);
        }
      },
      onOpen: () => setConnected(true),
      onClose: () => {
        setConnected(false);
        setSending(false);
      },
      onError: () => setConnected(false),
    });

    return () => {
      unsubscribe();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  function scheduleFlush() {
    if (flushTimerRef.current !== null) return;
    const tick = () => {
      const msgId = streamMsgIdRef.current;
      if (msgId && tokenQueueRef.current.length > 0) {
        const token = tokenQueueRef.current.shift()!;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, content: m.content + token } : m
          )
        );
        // keep view pinned
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        });
        flushTimerRef.current = window.setTimeout(tick, 20);
        return;
      }
      // No tokens left; finalize if complete signaled
      if (flushCompletePendingRef.current) {
        flushCompletePendingRef.current = false;
        streamMsgIdRef.current = null;
        setSending(false);
      }
      flushTimerRef.current = null;
    };
    flushTimerRef.current = window.setTimeout(tick, 10);
  }

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current !== null) {
        window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);
  return (
    <div className="relative flex flex-col h-full pb-safe overflow-x-hidden">
      {/* Ambient background effects */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/30 blur-3xl animate-pulse-slow" />
        <div
          className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-accent/25 blur-3xl animate-pulse-slow"
          style={{ animationDelay: "400ms" }}
        />
        <div
          className="absolute bottom-[-4rem] left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-indigo/20 blur-3xl animate-pulse-slow"
          style={{ animationDelay: "800ms" }}
        />
        <div className="absolute inset-0 bg-grid opacity-[0.18]" />
      </div>

      <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"
              }`}
            aria-label={connected ? "Connected" : "Disconnected"}
          />
          <div className="text-sm font-semibold">VARCA</div>
        </div>
        {(!connected || locationText) && (
          <div className="text-xs text-white/60 truncate">
            {!connected
              ? "Reconnecting…"
              : locationText
                ? `(${locationText})`
                : ""}
          </div>
        )}
        <button
          onTouchStart={handleSOSStart}
          onTouchEnd={handleSOSClear}
          onTouchCancel={handleSOSClear}
          onMouseDown={handleSOSStart}
          onMouseUp={handleSOSClear}
          onMouseLeave={handleSOSClear}
          onContextMenu={(e) => e.preventDefault()}
          className="ml-auto px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors border border-red-500/50 select-none touch-manipulation"
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          title="Hold for 5 seconds to send SOS"
          aria-label="SOS — hold for 5 seconds"
        >
          SOS
        </button>
        <button
          onClick={() => {
            clearPublicUserData();
            router.replace("/");
          }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors border border-white/10"
          title="End session and clear data"
        >
          Exit
        </button>
      </div>

      <div
        ref={scrollRef}
        className="themed-scroll overscroll-contain flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4"
      >
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            msg={m}
            isLast={i === messages.length - 1}
            onRetry={m.failed ? () => retryMessage(m.id) : undefined}
          />
        ))}
        {showQuickActions && messages.length <= 1 && !sending && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => sendQuickAction("I need to report an incident")}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm font-medium hover:bg-red-500/20 hover:border-red-500/50 transition-all active:scale-95"
            >
              <span>🚨</span>
              <span>Report an Incident</span>
            </button>
            <button
              type="button"
              onClick={() => sendQuickAction("Tell me about this event — schedule, venue, and key highlights")}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-blue-500/30 bg-blue-500/10 text-blue-300 text-sm font-medium hover:bg-blue-500/20 hover:border-blue-500/50 transition-all active:scale-95"
            >
              <span>ℹ️</span>
              <span>Event Info</span>
            </button>
          </div>
        )}
        {sending && <TypingIndicator />}
      </div>

      <form
        onSubmit={handleSend}
        className="px-4 md:px-6 py-3 sm:py-4 border-t border-white/10 bg-[#121213] space-y-2"
      >
        {(isCameraOpen || isRecording) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span>
                {isRecording
                  ? "Recording video… (maximum 4 seconds)"
                  : "Camera is ready – tap Record to start."}
              </span>
            </div>
            <div className="w-full rounded-xl overflow-hidden border border-red-500/40 bg-black">
              <video
                ref={recordingVideoRef}
                className="w-full h-48 object-cover"
                muted
                autoPlay
                playsInline
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseCamera}
                className="px-3 py-1.5 rounded-full border border-white/20 text-[11px] text-white/70 hover:text-white hover:bg-white/5"
              >
                Close camera
              </button>
              {isRecording ? (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="px-3 py-1.5 rounded-full bg-primary text-[11px] text-white hover:bg-primary/90"
                >
                  Stop recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startCustomVideoRecording()}
                  className="px-3 py-1.5 rounded-full bg-primary text-[11px] text-white hover:bg-primary/90"
                >
                  Record
                </button>
              )}
            </div>
          </div>
        )}
        {recordingError && !isRecording && (
          <p className="text-xs text-red-400">{recordingError}</p>
        )}
        {pendingAttachment && (
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/15 bg-black/40 flex items-center justify-center">
              {pendingAttachment.type === "image" && (
                <img
                  src={pendingAttachment.url}
                  alt={pendingAttachment.fileName || "Selected image"}
                  className="max-h-full max-w-full object-cover"
                />
              )}
              {pendingAttachment.type === "video" && (
                <video
                  src={pendingAttachment.url}
                  className="max-h-full max-w-full object-cover"
                  muted
                />
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2 overflow-hidden">
              <p className="text-xs text-white/70 truncate pr-1">
                {pendingAttachment.fileName.length > 12
                  ? pendingAttachment.fileName.substring(0, 12) + "…"
                  : pendingAttachment.fileName}
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="flex items-center justify-center h-8 w-8 rounded-full border border-white/25 text-white/70 hover:text-white hover:bg-white/5"
                  aria-label="Preview"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingAttachment?.url) {
                      try {
                        URL.revokeObjectURL(pendingAttachment.url);
                      } catch {
                        // ignore
                      }
                    }
                    setPendingAttachment(null);
                    setIsPreviewOpen(false);
                  }}
                  className="flex items-center justify-center h-8 w-8 rounded-full border border-white/20 text-white/60 hover:text-white/90 hover:bg-white/5"
                  aria-label="Remove"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleCameraClick}
            className="h-10 w-10 md:h-11 md:w-11 flex items-center justify-center rounded-full bg-[#141415] border border-white/15 text-white/80 hover:bg-white/5 transition-colors flex-shrink-0 touch-manipulation"
            aria-label="Open camera"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <rect
                x="3.5"
                y="6.5"
                width="17"
                height="13"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M9 6.5L10.2 4.8C10.6 4.2 11.3 3.8 12 3.8C12.7 3.8 13.4 4.2 13.8 4.8L15 6.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx="12"
                cy="13"
                r="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleMediaSelected}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleMediaSelected}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 48 + 24) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e as any);
              }
            }}
            placeholder="What's happening?"
            onFocus={handleFocus}
            onBlur={handleBlur}
            rows={1}
            className="flex-1 min-w-0 min-h-[48px] max-h-[72px] rounded-xl bg-[#141415] border border-white/10 px-4 py-3 outline-none appearance-none placeholder:text-white/60 text-[14px] leading-6 focus:ring-2 focus:ring-primary/30 touch-manipulation resize-none overflow-hidden"
            aria-label="Message"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={handleSendTouchStart}
            onTouchEnd={handleSendTouchEnd}
            onClick={(e) => {
              if (sendWasLongPress.current) {
                // Long press already handled — absorb click
                sendWasLongPress.current = false;
                return;
              }
              if (isListening) {
                // Tap while listening → stop mic
                stopListening();
                return;
              }
              // Normal send
              if (connected && (input.trim() || pendingAttachment) && !sending) {
                handleSend(e as unknown as React.FormEvent);
              }
            }}
            className={`h-12 md:h-12 inline-flex items-center justify-center gap-1.5 px-4 md:px-5 flex-shrink-0 touch-manipulation rounded-xl font-semibold text-sm transition-all duration-200 ${isListening
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
              : 'btn-primary'
              }`}
            aria-label={isListening ? 'Stop listening' : 'Send'}
          >
            {isListening ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="animate-[pulse_1s_ease-in-out_infinite]">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="opacity-50">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                Send
              </>
            )}
          </button>
        </div>
      </form>
      {isPreviewOpen && pendingAttachment && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md sm:max-w-lg md:max-w-2xl rounded-2xl bg-[#111112] border border-white/15 shadow-2xl p-4 sm:p-6 space-y-4 relative">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="absolute right-2 top-2 text-white/70 hover:text-white p-2"
              aria-label="Close preview"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div className="space-y-1 pr-6">
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                {pendingAttachment.type === "video" ? "Video preview" : "Photo preview"}
              </p>
              <p className="text-xs text-white/60 truncate">
                {pendingAttachment.fileName}
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/15 bg-black/70 max-h-[70vh] flex items-center justify-center">
              {pendingAttachment.type === "video" ? (
                <video
                  src={pendingAttachment.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-[70vh] w-auto h-auto mx-auto"
                />
              ) : (
                <img
                  src={pendingAttachment.url}
                  alt={pendingAttachment.fileName || "Captured photo"}
                  className="max-w-full max-h-[70vh] w-auto h-auto mx-auto object-contain"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium transition-colors"
            >
              {pendingAttachment.type === "video" ? "Use this video" : "Use this photo"}
            </button>
          </div>
        </div>
      )}
      {alertState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#111112] border border-white/15 shadow-2xl p-5 space-y-4 relative">
            <div className="flex items-start justify-between">
              {alertState.title && (
                <h3 className="text-sm font-semibold text-white pt-1">
                  {alertState.title}
                </h3>
              )}
              <button
                type="button"
                onClick={closeAlert}
                className="-mr-2 -mt-2 text-white/70 hover:text-white p-2"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <p className="text-sm text-white/80">{alertState.message}</p>
            <div className="flex justify-end gap-2">
              {alertState.kind === "camera-choice" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      photoInputRef.current?.click();
                      closeAlert();
                    }}
                    className="px-4 py-1.5 rounded-full border border-white/25 text-sm text-white/80 hover:bg-white/5"
                  >
                    Take a photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void openCameraPreview();
                      closeAlert();
                    }}
                    className="px-4 py-1.5 rounded-full bg-primary text-sm text-white hover:bg-primary/90"
                  >
                    Record video
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      closeAlert();
                    }}
                    className="px-4 py-1.5 rounded-full border border-white/25 text-sm text-white/80 hover:bg-white/5"
                  >
                    Upload from gallery
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={closeAlert}
                  className="px-4 py-1.5 rounded-full bg-primary text-sm text-white hover:bg-primary/90"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* SOS countdown overlay */}
      {sosCountdown !== null && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm select-none"
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="relative flex items-center justify-center">
            <div
              className="absolute rounded-full border-4 border-red-500 animate-ping"
              style={{ width: 160, height: 160 }}
            />
            <div
              className="flex items-center justify-center rounded-full bg-red-600 transition-all duration-1000 ease-out"
              style={{
                width: 80 + (5 - sosCountdown) * 20,
                height: 80 + (5 - sosCountdown) * 20,
              }}
            >
              <span className="text-5xl font-bold text-white tabular-nums">
                {sosCountdown}
              </span>
            </div>
          </div>
          <p className="mt-8 text-white/80 text-sm font-medium animate-pulse">
            Hold to send SOS…
          </p>
          <p className="mt-2 text-white/50 text-xs">
            Release to cancel
          </p>
        </div>
      )}

      {/* SOS emergency category grid */}
      {showSOSGrid && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-md select-none"
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-safe mt-4 mb-2">
            <div>
              <h2 className="text-xl font-bold text-white">🚨 Emergency Type</h2>
              <p className="text-white/60 text-xs mt-1">
                Hold a button for 3 seconds to send alert
              </p>
            </div>
            <button
              onClick={() => { setShowSOSGrid(false); handleCatClear(); }}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* 3x3 Grid */}
          <div className="flex-1 flex items-center justify-center px-5">
            <div className="grid grid-cols-3 gap-3 w-full max-w-md">
              {SOS_CATEGORIES.map((cat) => {
                const isActive = activeSosCat === cat.key;
                const borderColor =
                  cat.color === "red"
                    ? "border-red-500/40"
                    : cat.color === "orange"
                      ? "border-orange-500/40"
                      : "border-yellow-500/40";
                const bgIdle =
                  cat.color === "red"
                    ? "bg-red-500/10"
                    : cat.color === "orange"
                      ? "bg-orange-500/10"
                      : "bg-yellow-500/10";
                return (
                  <button
                    key={cat.key}
                    onTouchStart={() => handleCatStart(cat.key)}
                    onTouchEnd={handleCatClear}
                    onTouchCancel={handleCatClear}
                    onMouseDown={() => handleCatStart(cat.key)}
                    onMouseUp={handleCatClear}
                    onMouseLeave={handleCatClear}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`relative flex flex-col items-center justify-center gap-1.5 py-5 rounded-2xl border text-center font-medium transition-all duration-300 touch-manipulation ${bgIdle} ${borderColor} hover:scale-[1.02]`}
                    style={{
                      WebkitTouchCallout: "none",
                      WebkitUserSelect: "none",
                      visibility: isActive ? "hidden" : "visible",
                    }}
                  >
                    <span className="text-3xl">{cat.icon}</span>
                    <span className="text-[11px] text-white/90 leading-tight">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expanded active button overlay — centered on screen */}
          {activeSosCat && sosCatCountdown !== null && (() => {
            const cat = SOS_CATEGORIES.find((c) => c.key === activeSosCat);
            if (!cat) return null;
            const borderColor =
              cat.color === "red"
                ? "border-red-500"
                : cat.color === "orange"
                  ? "border-orange-500"
                  : "border-yellow-500";
            const bgColor =
              cat.color === "red"
                ? "bg-red-500/30"
                : cat.color === "orange"
                  ? "bg-orange-500/30"
                  : "bg-yellow-500/30";
            const glowColor =
              cat.color === "red"
                ? "shadow-[0_0_60px_rgba(239,68,68,0.4)]"
                : cat.color === "orange"
                  ? "shadow-[0_0_60px_rgba(249,115,22,0.4)]"
                  : "shadow-[0_0_60px_rgba(234,179,8,0.4)]";
            return (
              <div
                className="fixed inset-0 z-[70] flex items-center justify-center"
                style={{ pointerEvents: "none" }}
              >
                <div
                  className={`flex flex-col items-center justify-center gap-3 w-48 h-56 rounded-3xl border-2 ${borderColor} ${bgColor} ${glowColor} backdrop-blur-md animate-[expandIn_0.25s_ease-out_both]`}
                  style={{ pointerEvents: "auto" }}
                  onTouchEnd={handleCatClear}
                  onTouchCancel={handleCatClear}
                  onMouseUp={handleCatClear}
                >
                  <span className="text-5xl">{cat.icon}</span>
                  <span className="text-sm text-white/90 font-medium">
                    {cat.label}
                  </span>
                  <span className="text-5xl font-bold text-white tabular-nums animate-pulse">
                    {sosCatCountdown}
                  </span>
                  <span className="text-[10px] text-white/50 font-medium uppercase tracking-wider">Keep holding…</span>
                  <span className="text-[9px] text-white/30 -mt-2">Release to cancel</span>
                </div>
              </div>
            );
          })()}

          {/* Footer hint */}
          <div className="px-5 pb-safe mb-4 text-center">
            <p className="text-white/40 text-xs">Press and hold to confirm</p>
          </div>
        </div>
      )}
    </div>
  );
}