"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import {
    getAuthWS,
    isAuthWSOpen,
    subscribeAuthWS,
    getAuthUserMeta,
    disconnectAuthWS,
    getOrCreateSessionId,
} from "@/lib/auth-ws";
import { getStoredAccessToken } from "@/lib/auth";

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

type MessageBubbleProps = {
    msg: Message;
    isLast: boolean;
};

// Directus backend URL for file downloads
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://app.dev.thrivelogic.ai";

// Regex to match (document::UUID) pattern
const DOCUMENT_REF_REGEX = /\(document::([a-f0-9-]{36})\)/gi;

/**
 * Download/view a file from Directus with authentication
 * Opens window immediately to avoid popup blocker, then loads content
 */
async function downloadDocument(fileId: string, setLoading?: (loading: boolean) => void): Promise<void> {
    setLoading?.(true);

    try {
        const token = getStoredAccessToken();
        if (!token) {
            alert("Please log in to view documents.");
            setLoading?.(false);
            return;
        }

        // Fetch the file with auth header
        const downloadUrl = `${BACKEND_URL}/assets/${fileId}`;
        const response = await fetch(downloadUrl, {
            headers: {
                "Authorization": `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch document: ${response.status}`);
        }

        // Get content type and create blob
        const contentType = response.headers.get("Content-Type") || "application/octet-stream";
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        // Use anchor element with download attribute - works better on mobile
        const link = document.createElement("a");
        link.href = blobUrl;

        // For PDFs and images, try to open inline; for others, force download
        if (contentType.includes("pdf") || contentType.includes("image")) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        } else {
            link.download = `document-${fileId}`;
        }

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to download document:", error);
        alert("Failed to download document. Please try again.");
    } finally {
        setLoading?.(false);
    }
}

/**
 * Modal overlay to display a document
 */
function DocumentModal({
    blobUrl,
    contentType,
    onClose
}: {
    blobUrl: string;
    contentType: string;
    onClose: () => void;
}) {
    const isImage = contentType.includes("image");
    const isPdf = contentType.includes("pdf");

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="relative max-w-4xl w-full max-h-[90vh] bg-[#1b1b1c] rounded-2xl border border-white/10 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <span className="text-sm font-medium text-white/80">Document Viewer</span>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-auto max-h-[calc(90vh-56px)]">
                    {isImage ? (
                        <img
                            src={blobUrl}
                            alt="Document"
                            className="w-full h-auto"
                        />
                    ) : isPdf ? (
                        <iframe
                            src={blobUrl}
                            className="w-full h-[80vh]"
                            title="PDF Document"
                        />
                    ) : (
                        <div className="p-8 text-center">
                            <p className="text-white/60 mb-4">This file type cannot be previewed.</p>
                            <a
                                href={blobUrl}
                                download="document"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm font-medium transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download File
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Component to render a document download button with in-page viewer
 */
function DocumentLink({ fileId }: { fileId: string }) {
    const [loading, setLoading] = useState(false);
    const [viewerData, setViewerData] = useState<{ blobUrl: string; contentType: string } | null>(null);

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (loading) return;

        setLoading(true);
        try {
            const token = getStoredAccessToken();
            if (!token) {
                alert("Please log in to view documents.");
                return;
            }

            const downloadUrl = `${BACKEND_URL}/assets/${fileId}`;
            const response = await fetch(downloadUrl, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch document: ${response.status}`);
            }

            const contentType = response.headers.get("Content-Type") || "application/octet-stream";
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            // Show in modal
            setViewerData({ blobUrl, contentType });
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Failed to load document:", error);
            alert("Failed to load document. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (viewerData) {
            URL.revokeObjectURL(viewerData.blobUrl);
        }
        setViewerData(null);
    };

    return (
        <>
            <button
                onClick={handleClick}
                disabled={loading}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-medium transition-colors ${loading
                    ? "bg-white/10 text-white/50 border-white/20 cursor-wait"
                    : "bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
                    }`}
                title={loading ? "Loading..." : `View document`}
            >
                {loading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                )}
                <span>{loading ? "Loading..." : "View Document"}</span>
            </button>

            {viewerData && (
                <DocumentModal
                    blobUrl={viewerData.blobUrl}
                    contentType={viewerData.contentType}
                    onClose={handleClose}
                />
            )}
        </>
    );
}

/**
 * Process message content and replace document references with React elements
 */
function processDocumentReferences(content: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    // Reset regex lastIndex
    DOCUMENT_REF_REGEX.lastIndex = 0;

    while ((match = DOCUMENT_REF_REGEX.exec(content)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(content.slice(lastIndex, match.index));
        }

        // Add the document link component
        const fileId = match[1];
        parts.push(<DocumentLink key={`doc-${fileId}-${match.index}`} fileId={fileId} />);

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last match
    if (lastIndex < content.length) {
        parts.push(content.slice(lastIndex));
    }

    // If no matches, return original content
    if (parts.length === 0) {
        return content;
    }

    return <>{parts}</>;
}

const MessageBubble = memo(
    function MessageBubble(props: MessageBubbleProps) {
        const isUser = props.msg.role === "user";
        return (
            <div
                className={`flex ${isUser ? "justify-end" : "justify-start"} ${props.isLast ? "message-in" : ""}`}
            >
                <div
                    className={`max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl border backdrop-blur ${isUser
                        ? "bg-primary text-white border-transparent shadow-[0_8px_20px_rgba(233,66,108,0.35)]"
                        : "bg-white/5 text-white/90 border-white/10 shadow-[0_6px_18px_rgba(76,0,255,0.16)]"
                        }`}
                >
                    <div className="whitespace-pre-wrap">
                        {processDocumentReferences(props.msg.content)}
                    </div>
                    {props.msg.attachment && (
                        <div className="mt-2 space-y-1">
                            {props.msg.attachment.type === "image" && (
                                <img
                                    src={props.msg.attachment.url}
                                    alt={props.msg.attachment.fileName || "Attached image"}
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

export default function AuthenticatedChatWindow() {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [connected, setConnected] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const streamMsgIdRef = useRef<string | null>(null);
    const tokenQueueRef = useRef<string[]>([]);
    const flushTimerRef = useRef<number | null>(null);
    const flushCompletePendingRef = useRef(false);

    // Welcome message
    useEffect(() => {
        if (!user) return;
        const firstName = user.first_name || user.email.split("@")[0];
        const welcome = `Hello ${firstName}! I'm your AI assistant. How can I help you today?`;
        setMessages([
            {
                id: "m1",
                role: "assistant",
                content: welcome,
            },
        ]);
    }, [user]);

    // Scroll to bottom on new messages
    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [messages]);

    // WebSocket connection and message handling
    useEffect(() => {
        const ws = getAuthWS();
        setConnected(ws.readyState === WebSocket.OPEN);

        const unsubscribe = subscribeAuthWS({
            onMessage: (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // eslint-disable-next-line no-console
                    console.log("Auth WS message:", data);

                    if (data.type !== "message") return;

                    // Session ID is now generated on frontend - no need to capture from backend

                    // Ensure streaming target exists
                    if (!streamMsgIdRef.current) {
                        const newId = crypto.randomUUID();
                        streamMsgIdRef.current = newId;
                        setMessages((prev) => [
                            ...prev,
                            { id: newId, role: "assistant", content: "" },
                        ]);
                    }

                    // Queue token for smooth rendering
                    if (typeof data.content === "string") {
                        tokenQueueRef.current.push(data.content);
                        scheduleFlush();
                    }

                    if (data.isComplete) {
                        flushCompletePendingRef.current = true;
                        scheduleFlush();
                    }
                } catch {
                    // Plain string response
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
                requestAnimationFrame(() => {
                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
                });
                flushTimerRef.current = window.setTimeout(tick, 20);
                return;
            }

            if (flushCompletePendingRef.current) {
                flushCompletePendingRef.current = false;
                streamMsgIdRef.current = null;
                setSending(false);
            }
            flushTimerRef.current = null;
        };

        flushTimerRef.current = window.setTimeout(tick, 10);
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnectAuthWS();
        };
    }, []);

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text) return;
        if (!isAuthWSOpen()) return;

        setInput("");

        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: "user",
            content: text,
        };
        setMessages((m) => [...m, userMsg]);

        const ws = getAuthWS();
        const userMeta = getAuthUserMeta();

        const payload = {
            user_uuid: userMeta?.id,
            message: text,
            time: new Date().toISOString(),
            user_meta: userMeta,
            session_id: getOrCreateSessionId(), // Frontend-generated UUID4 for chat history
        };

        // eslint-disable-next-line no-console
        console.log("Auth WS sending:", payload);

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
            setSending(true);
        }
    }

    return (
        <div className="relative flex flex-col h-full pb-safe">
            {/* Ambient background */}
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

            {/* Header */}
            <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <span
                        className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"
                            }`}
                        aria-label={connected ? "Connected" : "Disconnected"}
                    />
                    <div className="text-sm font-semibold">VARCA Assistant</div>
                </div>
                <div className="ml-auto text-xs text-white/60">
                    {!connected ? "Reconnecting…" : "Full Access Mode"}
                </div>
            </div>

            {/* Messages */}
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

            {/* Input */}
            <form
                onSubmit={handleSend}
                className="px-4 md:px-6 py-3 sm:py-4 border-t border-white/10 bg-[#121213]"
            >
                <div className="flex items-center gap-2 sm:gap-3">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask me anything…"
                        className="flex-1 min-w-0 h-12 md:h-12 rounded-xl bg-[#141415] border border-white/10 px-4 py-0 outline-none appearance-none placeholder:text-white/60 text-[16px] leading-6 focus:ring-2 focus:ring-primary/30 touch-manipulation"
                        aria-label="Message"
                    />
                    <button
                        type="submit"
                        disabled={sending || !input.trim() || !connected}
                        className="btn-primary h-12 md:h-12 inline-flex items-center justify-center px-4 md:px-5 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 touch-manipulation"
                        aria-label="Send"
                    >
                        Send
                    </button>
                </div>
            </form>
        </div>
    );
}
