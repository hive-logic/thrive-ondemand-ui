"use client";

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { loadSession, UserSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import { getWS, getActivityIdFromUrl, isWSOpen, subscribeWS } from "@/lib/ws";

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
};

const MessageBubble = memo(
  function MessageBubble(props: MessageBubbleProps) {
    const isUser = props.msg.role === "user";
    return (
      <div
        className={`flex ${isUser ? "justify-end" : "justify-start"} ${
          props.isLast ? "message-in" : ""
        }`}
      >
        <div
          className={`max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl border backdrop-blur ${
            isUser
              ? "bg-primary text-white border-transparent shadow-[0_8px_20px_rgba(233,66,108,0.35)]"
              : "bg-white/5 text-white/90 border-white/10 shadow-[0_6px_18px_rgba(76,0,255,0.16)]"
          }`}
        >
          <p className="whitespace-pre-wrap">{props.msg.content}</p>
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
  (prev, next) => prev.msg === next.msg && prev.isLast === next.isLast
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
  const [connected, setConnected] = useState(false);
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
    const welcome = `Hey ${firstName}! I’m your on-site concierge. How can I help you today?`;
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
          // ignore and fall back
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

        const fileName = `recorded-${Date.now()}.${
          recConfig.extension === "mp4" ? "mp4" : "webm"
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text && !pendingAttachment) return;
    if (!isWSOpen()) {
      // prevent sending while disconnected
      return;
    }

    setInput("");
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

    const basePayload = {
      activity_id: getActivityIdFromUrl(),
      session_id: session?.session_id ?? null,
      message: text,
      time: new Date().toISOString(),
      user_meta: userMeta,
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
      } catch {
        // eslint-disable-next-line no-console
        console.error("Video duration could not be read. Selected video was rejected.");
        URL.revokeObjectURL(objectUrl);
        e.target.value = "";
        return;
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
    <div className="relative flex flex-col h-full pb-safe">
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
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-emerald-400" : "bg-red-400"
            }`}
            aria-label={connected ? "Connected" : "Disconnected"}
          />
          <div className="text-sm font-semibold">VARCA</div>
        </div>
        {(!connected || locationText) && (
          <div className="ml-auto text-xs text-white/60 truncate">
            {!connected
              ? "Reconnecting…"
              : locationText
              ? `(${locationText})`
              : ""}
          </div>
        )}
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
          />
        ))}
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
        <div className="flex items-center gap-2 sm:gap-3">
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
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message…"
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="flex-1 min-w-0 h-12 md:h-12 rounded-xl bg-[#141415] border border-white/10 px-4 py-0 outline-none appearance-none placeholder:text-white/60 text-[16px] leading-6 focus:ring-2 focus:ring-primary/30 touch-manipulation"
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={
              sending || (!input.trim() && !pendingAttachment) || !connected
            }
            className="btn-primary h-12 md:h-12 inline-flex items-center justify-center px-4 md:px-5 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 touch-manipulation"
            aria-label="Send"
          >
            Send
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
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              ) : (
                <img
                  src={pendingAttachment.url}
                  alt={pendingAttachment.fileName || "Captured photo"}
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
            >
              Close
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
    </div>
  );
}