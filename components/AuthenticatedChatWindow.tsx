"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { fetchQuickActionsData } from "@/lib/backend-api";
import {
    getAuthWS,
    isAuthWSOpen,
    subscribeAuthWS,
    getAuthUserMeta,
    disconnectAuthWS,
    getOrCreateSessionId,
} from "@/lib/auth-ws";
import { getStoredAccessToken } from "@/lib/auth";
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
 * Component to render a document download button - downloads directly to device
 */
function DocumentLink({ fileId }: { fileId: string }) {
    const [loading, setLoading] = useState(false);

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (loading) return;

        setLoading(true);
        try {
            const token = getStoredAccessToken();
            if (!token) {
                alert("Please log in to download documents.");
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

            // Determine file extension from content type
            const extMap: Record<string, string> = {
                "application/pdf": ".pdf",
                "image/jpeg": ".jpg",
                "image/png": ".png",
                "image/gif": ".gif",
                "image/webp": ".webp",
                "video/mp4": ".mp4",
                "text/plain": ".txt",
            };
            const ext = extMap[contentType] || "";
            const fileName = `document-${fileId.slice(0, 8)}${ext}`;

            // Create download link and trigger download
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up blob URL after a short delay
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Failed to download document:", error);
            alert("Failed to download document. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-medium transition-colors ${
                loading ? "bg-white/10 text-white/50 border-white/20 cursor-wait" : "bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
            }`}
            title={loading ? "Downloading..." : "Download document"}
        >
            {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            )}
            <span>{loading ? "Downloading..." : "Download"}</span>
        </button>
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
                    className={`max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl border backdrop-blur ${
                        isUser
                            ? "bg-primary text-white border-transparent shadow-[0_8px_20px_rgba(233,66,108,0.35)]"
                            : "bg-white/5 text-white/90 border-white/10 shadow-[0_6px_18px_rgba(76,0,255,0.16)]"
                    }`}
                >
                    <div>
                        {isUser ? (
                            <p className="whitespace-pre-wrap">{props.msg.content}</p>
                        ) : (
                            <MarkdownMessage content={props.msg.content} />
                        )}
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
    const [actionsOpen, setActionsOpen] = useState(false);
    const [quickActionsData, setQuickActionsData] = useState<Record<string, any>>({});
    const [expandedAction, setExpandedAction] = useState<string | null>(null);
    const [expandedSite, setExpandedSite] = useState<string | null>(null);
    const [loadingActions, setLoadingActions] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const streamMsgIdRef = useRef<string | null>(null);
    const tokenQueueRef = useRef<string[]>([]);
    const flushTimerRef = useRef<number | null>(null);
    const flushCompletePendingRef = useRef(false);

    // Fetch quick actions data
    useEffect(() => {
        if (!user?.customer?.id) return;
        
        async function loadActions() {
            setLoadingActions(true);
            try {
                const token = getStoredAccessToken();
                if (!token) return;
                
                const data = await fetchQuickActionsData(user!.customer!.id, token);
                if (data) {
                    setQuickActionsData(data);
                }
            } catch (err) {
                console.error("Failed to load quick actions data:", err);
            } finally {
                setLoadingActions(false);
            }
        }
        
        loadActions();
    }, [user]);

    // Protocol action definitions (matching Directus)
    const protocolActions = [
        { key: "fire", icon: "🔥", label: "Fire", color: "red", severity: 10 },
        { key: "active_shooter", icon: "🔫", label: "Active Shooter", color: "red", severity: 10 },
        { key: "fall_medical", icon: "🤕", label: "Fall / Medical", color: "yellow", severity: 7 },
        { key: "intrusion", icon: "🚨", label: "Intrusion", color: "red", severity: 8 },
        { key: "general_alert", icon: "⚠️", label: "General Alert", color: "red", severity: 9 },
    ];

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
                    // Plain string response — filter out errors and system messages
                    const raw = String(event.data);
                    if (
                        raw.startsWith("Invalid") ||
                        raw.startsWith("Error") ||
                        raw.includes("pong") ||
                        raw.includes("ping")
                    ) {
                        // eslint-disable-next-line no-console
                        console.log("Auth WS system/error (ignored):", raw);
                        return;
                    }
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: crypto.randomUUID(),
                            role: "assistant",
                            content: raw,
                        },
                    ]);
                }
            },
            onOpen: () => setConnected(true),
            onClose: () => {
                setConnected(false);
                // Don't immediately clear sending state - let reconnection restore it
                // Only clear if there's no active streaming (streamMsgIdRef will be set during active response)
                // The ping mechanism will keep connection alive, this is fallback behavior
                if (!streamMsgIdRef.current) {
                    setSending(false);
                }
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

    function sendQuickAction(text: string, payloadStr?: string) {
        if (!isAuthWSOpen() || sending) return;
        setActionsOpen(false);
        setExpandedAction(null);
        setExpandedSite(null);

        // Always show the text to the user
        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: "user",
            content: text,
        };
        setMessages((m) => [...m, userMsg]);

        const ws = getAuthWS();
        const userMeta = getAuthUserMeta();
        
        // If a deterministic payload is provided, send that to the bot instead of the text
        const messageToSend = payloadStr ? `###quick_actions###${payloadStr}###` : text;
        
        const payload = {
            user_uuid: userMeta?.id,
            message: messageToSend,
            time: new Date().toISOString(),
            user_meta: userMeta,
            session_id: getOrCreateSessionId(),
        };

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
            setSending(true);
        }
    }

    function handleMainActionClick(type: string, payloadType: string, label: string) {
        if (!quickActionsData[type] || quickActionsData[type].length === 0) {
            // Send the "all" action if there are no sub-items
            if (payloadType) {
                const payload = JSON.stringify({ type: payloadType, id: "", name: "" });
                sendQuickAction(`Executing action for all: ${label}`, payload);
            }
            return;
        }

        // Toggle sub-menu
        if (expandedAction === type) {
            setExpandedAction(null);
            setExpandedSite(null);
        } else {
            setExpandedAction(type);
            setExpandedSite(null);
        }
    }

    function handleProtocolSubmit(site: any, proto: any) {
        const payload = JSON.stringify({
            type: "protocol_execute",
            site_id: site.id,
            site_name: site.name,
            protocol: proto.key,
            protocol_label: proto.label,
            color: proto.color,
            severity: proto.severity,
        });
        sendQuickAction(`Initiating ${proto.label} protocol at ${site.name}`, payload);
    }

    function handleSubItemClick(actionType: string, item: any, labelPrefix: string) {
        const payload = JSON.stringify({
            type: actionType,
            id: item.id,
            name: item.name || item.title || item.date || "",
        });
        const itemName = item.name || item.title || item.date || "Selected item";
        sendQuickAction(`${labelPrefix}: ${itemName}`, payload);
    }

    function handleStrobeFlash(item: any, color: string) {
        const payload = JSON.stringify({
            type: "notifier_visual_color",
            id: item.id,
            name: item.name || "",
            color: color,
        });
        sendQuickAction(`Flashing ${color} strobe at ${item.name}`, payload);
    }

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
            session_id: getOrCreateSessionId(),
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
            <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <span
                        className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"
                            }`}
                        aria-label={connected ? "Connected" : "Disconnected"}
                    />
                    <div className="text-sm font-semibold">VARCA Assistant</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setActionsOpen((o) => !o)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                            actionsOpen
                                ? "bg-white/15 border-white/20 text-white"
                                : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                        <span>⚡</span>
                        <span>Actions</span>
                        <svg
                            className={`w-3 h-3 transition-transform ${actionsOpen ? "rotate-180" : ""}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <div className="text-xs text-white/40">
                        {!connected ? "Reconnecting…" : ""}
                    </div>
                </div>
            </div>

            {/* Quick Actions Panel */}
            {actionsOpen && (
                <div className="px-4 md:px-6 py-3 border-b border-white/10 bg-white/[0.02] space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 relative z-10">
                    
                    {loadingActions && (
                        <div className="absolute inset-0 flex border-b items-center justify-center bg-black/50 backdrop-blur-sm z-20 rounded-xl">
                            <div className="flex items-center gap-2 text-white/70 text-sm">
                                <svg className="w-4 h-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span>Loading your devices...</span>
                            </div>
                        </div>
                    )}
                    
                    {/* --- ACTIONS GROUP --- */}
                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1">Actions</div>
                    <div className="flex flex-wrap gap-2">
                        {/* Protocols */}
                        <div className="relative">
                            <button type="button" onClick={() => handleMainActionClick("sites", "protocol", "Protocols")}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all active:scale-95 ${expandedAction === 'sites' ? 'bg-primary/20 border-primary/50 text-white' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}`}>
                                <span>🛡️</span> Protocols {quickActionsData.sites?.length > 0 && <span className={`text-[10px] opacity-50 transition-transform ${expandedAction === 'sites' ? 'rotate-90' : ''}`}>▶</span>}
                            </button>
                            {expandedAction === 'sites' && (
                                <div className="absolute top-full left-0 mt-2 w-64 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    {quickActionsData.sites?.map((site: any) => (
                                        <div key={site.id} className="border-b border-white/5 last:border-0 relative">
                                            <button type="button" onClick={() => setExpandedSite(expandedSite === site.id ? null : site.id)}
                                                className={`w-full text-left px-3 py-2.5 text-[12px] font-medium transition-colors flex items-center justify-between ${expandedSite === site.id ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5"}`}>
                                                <span>{site.name}</span>
                                                <span className={`transition-transform opacity-50 text-[10px] ${expandedSite === site.id ? "rotate-90" : ""}`}>▶</span>
                                            </button>
                                            
                                            {/* Protocol Grid Dropdown */}
                                            {expandedSite === site.id && (
                                                <div className="bg-black/40 p-2 grid grid-cols-1 gap-1 border-t border-white/5 shadow-inner">
                                                    {protocolActions.map((proto) => (
                                                        <button key={proto.key} onClick={() => handleProtocolSubmit(site, proto)}
                                                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/90 text-[12px] font-medium text-left">
                                                            <span className="text-base">{proto.icon}</span>
                                                            <span>{proto.label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Visual Notifiers (Strobes) */}
                        <div className="relative">
                            <button type="button" onClick={() => handleMainActionClick("notifiers_visual", "notifier_visual_all", "Flash Strobe")}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all active:scale-95 ${expandedAction === 'notifiers_visual' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-100' : 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300 hover:bg-yellow-500/10'}`}>
                                <span>⚡</span> Flash Strobe {quickActionsData.notifiers_visual?.length > 0 && <span className={`text-[10px] opacity-50 transition-transform ${expandedAction === 'notifiers_visual' ? 'rotate-90' : ''}`}>▶</span>}
                            </button>
                            {expandedAction === 'notifiers_visual' && (
                                <div className="absolute top-full left-0 mt-2 w-64 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    <div className="max-h-64 overflow-y-auto themed-scroll">
                                    {quickActionsData.notifiers_visual?.map((item: any) => (
                                        <div key={item.id} className="flex flex-col px-3 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                            <span className="text-[12px] text-white/90 mb-2 truncate">{item.name}</span>
                                            <div className="flex items-center justify-between gap-2">
                                                <button onClick={() => handleStrobeFlash(item, 'green')} className="flex-1 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/50 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-widest text-center transition-colors">GREEN</button>
                                                <button onClick={() => handleStrobeFlash(item, 'yellow')} className="flex-1 py-1.5 rounded bg-yellow-500/20 hover:bg-yellow-500/50 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold tracking-widest text-center transition-colors">YELLOW</button>
                                                <button onClick={() => handleStrobeFlash(item, 'red')} className="flex-1 py-1.5 rounded bg-red-500/20 hover:bg-red-500/50 border border-red-500/30 text-red-500 text-[10px] font-bold tracking-widest text-center transition-colors">RED</button>
                                            </div>
                                        </div>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* audio */}
                        <div className="relative">
                            <button type="button" onClick={() => handleMainActionClick("notifiers_audio", "notifier_audio_all", "Audio Alert")}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all active:scale-95 ${expandedAction === 'notifiers_audio' ? 'bg-orange-500/20 border-orange-500/50 text-orange-100' : 'border-orange-500/20 bg-orange-500/5 text-orange-300 hover:bg-orange-500/10'}`}>
                                <span>🔊</span> Audio Alert {quickActionsData.notifiers_audio?.length > 0 && <span className={`text-[10px] opacity-50 transition-transform ${expandedAction === 'notifiers_audio' ? 'rotate-90' : ''}`}>▶</span>}
                            </button>
                            {expandedAction === 'notifiers_audio' && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    <div className="max-h-64 overflow-y-auto themed-scroll">
                                    {quickActionsData.notifiers_audio?.map((item: any) => (
                                        <button key={item.id} onClick={() => handleSubItemClick("notifier_audio", item, "Play alert at")}
                                            className="w-full text-left px-3 py-2.5 text-[12px] text-white/80 hover:bg-white/10 hover:text-white border-b border-white/5 last:border-0 truncate transition-colors">
                                            {item.name}
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* doors */}
                        <div className="relative">
                            <button type="button" onClick={() => handleMainActionClick("doors", "door_lock_all", "Lock Doors")}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all active:scale-95 ${expandedAction === 'doors_lock' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-100' : 'border-indigo-500/20 bg-indigo-500/5 text-indigo-300 hover:bg-indigo-500/10'}`}>
                                <span>🔒</span> Lock Doors {quickActionsData.doors?.length > 0 && <span className={`text-[10px] opacity-50 transition-transform ${expandedAction === 'doors_lock' ? 'rotate-90' : ''}`}>▶</span>}
                            </button>
                            {expandedAction === 'doors_lock' && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    <div className="max-h-64 overflow-y-auto themed-scroll">
                                    {quickActionsData.doors?.map((item: any) => (
                                        <button key={item.id} onClick={() => handleSubItemClick("door_lock", item, "Lock")}
                                            className="w-full text-left px-3 py-2.5 text-[12px] text-white/80 hover:bg-red-500/20 hover:text-red-300 border-b border-white/5 last:border-0 truncate transition-colors">
                                            {item.name}
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <button type="button" onClick={() => handleMainActionClick("doors", "door_unlock_all", "Unlock Doors")}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all active:scale-95 ${expandedAction === 'doors_unlock' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-100' : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10'}`}>
                                <span>🔓</span> Unlock Doors {quickActionsData.doors?.length > 0 && <span className={`text-[10px] opacity-50 transition-transform ${expandedAction === 'doors_unlock' ? 'rotate-90' : ''}`}>▶</span>}
                            </button>
                            {expandedAction === 'doors_unlock' && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    <div className="max-h-64 overflow-y-auto themed-scroll">
                                    {quickActionsData.doors?.map((item: any) => (
                                        <button key={item.id} onClick={() => handleSubItemClick("door_unlock", item, "Unlock")}
                                            className="w-full text-left px-3 py-2.5 text-[12px] text-white/80 hover:bg-emerald-500/20 hover:text-emerald-300 border-b border-white/5 last:border-0 truncate transition-colors">
                                            {item.name}
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* --- QUICK INFO GROUP --- */}
                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1 mt-4">Quick Info</div>
                    <div className="flex flex-wrap gap-2 pb-2">
                        {/* cameras */}
                        <div className="relative">
                            <button type="button" onClick={() => handleMainActionClick("cameras", "camera_status_all", "Camera Status")}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all active:scale-95 ${expandedAction === 'cameras' ? 'bg-blue-500/20 border-blue-500/50 text-blue-100' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}`}>
                                <span>📹</span> Camera Status {quickActionsData.cameras?.length > 0 && <span className={`text-[10px] opacity-50 transition-transform ${expandedAction === 'cameras' ? 'rotate-90' : ''}`}>▶</span>}
                            </button>
                            {expandedAction === 'cameras' && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    <div className="max-h-64 overflow-y-auto themed-scroll">
                                    {quickActionsData.cameras?.map((item: any) => (
                                        <button key={item.id} onClick={() => handleSubItemClick("camera_status", item, "Status for camera")}
                                            className="w-full text-left px-3 py-2.5 text-[12px] text-white/80 hover:bg-white/10 hover:text-white border-b border-white/5 last:border-0 flex justify-between items-center transition-colors">
                                            <span className="truncate pr-2">{item.name}</span>
                                            {item.status && <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${item.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-500'}`}>{item.status}</span>}
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* doors info */}
                        <div className="relative">
                            <button type="button" onClick={() => handleMainActionClick("doors", "door_status_all", "Door Status")}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all active:scale-95 ${expandedAction === 'doors_status' ? 'bg-blue-500/20 border-blue-500/50 text-blue-100' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}`}>
                                <span>🚪</span> Door Status {quickActionsData.doors?.length > 0 && <span className={`text-[10px] opacity-50 transition-transform ${expandedAction === 'doors_status' ? 'rotate-90' : ''}`}>▶</span>}
                            </button>
                            {expandedAction === 'doors_status' && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    <div className="max-h-64 overflow-y-auto themed-scroll">
                                    {quickActionsData.doors?.map((item: any) => (
                                        <button key={item.id} onClick={() => handleSubItemClick("door_status", item, "Status for door")}
                                            className="w-full text-left px-3 py-2.5 text-[12px] text-white/80 hover:bg-white/10 hover:text-white border-b border-white/5 last:border-0 flex justify-between items-center transition-colors">
                                            <span className="truncate pr-2">{item.name}</span>
                                            {item.status && <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${item.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-500'}`}>{item.status}</span>}
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SOPs */}
                        <div className="relative">
                            <button type="button" onClick={() => handleMainActionClick("sops", "sop_all", "SOPs")}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all active:scale-95 ${expandedAction === 'sops' ? 'bg-blue-500/20 border-blue-500/50 text-blue-100' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}`}>
                                <span>📖</span> SOPs {quickActionsData.sops?.length > 0 && <span className={`text-[10px] opacity-50 transition-transform ${expandedAction === 'sops' ? 'rotate-90' : ''}`}>▶</span>}
                            </button>
                            {expandedAction === 'sops' && (
                                <div className="absolute top-full left-0 mt-2 w-64 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    <div className="max-h-64 overflow-y-auto themed-scroll">
                                    {quickActionsData.sops?.map((item: any) => (
                                        <button key={item.id} onClick={() => handleSubItemClick("sop", item, "Show SOP")}
                                            className="w-full text-left px-3 py-2.5 text-[12px] text-white/80 hover:bg-white/10 hover:text-white border-b border-white/5 last:border-0 truncate transition-colors">
                                            {item.title || item.name}
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Direct action single clicks */}
                        <button type="button" onClick={() => sendQuickAction("Help me create an incident report")}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-300 text-[12px] font-medium hover:bg-red-500/10 transition-all active:scale-95">
                            <span>📋</span> Incident Report
                        </button>
                        <button type="button" onClick={() => sendQuickAction("Show me the recent alerts")}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/80 text-[12px] font-medium hover:bg-white/10 transition-all active:scale-95">
                            <span>🔔</span> Recent Alerts
                        </button>
                    </div>
                </div>
            )}

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
