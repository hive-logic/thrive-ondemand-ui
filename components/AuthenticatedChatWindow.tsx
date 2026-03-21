"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { fetchQuickActionsData, fetchAccessZones, fetchLiveAlerts, fetchLastNotification, markAlertSeen, LiveAlert } from "@/lib/backend-api";
import { requestUserLocation } from "@/lib/geolocation";
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
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://app.thrivelogic.ai";

// Regex to match (document::UUID) pattern
const DOCUMENT_REF_REGEX = /\(document::([a-f0-9-]{36})\)/gi;

/**
 * Download/view a file from Directus with authentication
 */
async function downloadDocument(fileId: string, setLoading?: (loading: boolean) => void): Promise<void> {
    setLoading?.(true);
    try {
        const token = getStoredAccessToken();
        if (!token) { alert("Please log in to view documents."); setLoading?.(false); return; }
        const downloadUrl = `${BACKEND_URL}/assets/${fileId}`;
        const response = await fetch(downloadUrl, { headers: { "Authorization": `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
        const contentType = response.headers.get("Content-Type") || "application/octet-stream";
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        if (contentType.includes("pdf") || contentType.includes("image")) {
            link.target = "_blank"; link.rel = "noopener noreferrer";
        } else {
            link.download = `document-${fileId}`;
        }
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
        console.error("Failed to download document:", error);
        alert("Failed to download document. Please try again.");
    } finally {
        setLoading?.(false);
    }
}

function DocumentLink({ fileId }: { fileId: string }) {
    const [loading, setLoading] = useState(false);
    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        try {
            const token = getStoredAccessToken();
            if (!token) { alert("Please log in to download documents."); return; }
            const downloadUrl = `${BACKEND_URL}/assets/${fileId}`;
            const response = await fetch(downloadUrl, { headers: { "Authorization": `Bearer ${token}` } });
            if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
            const contentType = response.headers.get("Content-Type") || "application/octet-stream";
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const extMap: Record<string, string> = {
                "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png",
                "image/gif": ".gif", "image/webp": ".webp", "video/mp4": ".mp4", "text/plain": ".txt",
            };
            const ext = extMap[contentType] || "";
            const fileName = `document-${fileId.slice(0, 8)}${ext}`;
            const link = document.createElement("a");
            link.href = blobUrl; link.download = fileName;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (error) {
            console.error("Failed to download document:", error);
            alert("Failed to download document. Please try again.");
        } finally { setLoading(false); }
    };
    return (
        <button onClick={handleClick} disabled={loading}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-medium transition-colors ${loading ? "bg-white/10 text-white/50 border-white/20 cursor-wait" : "bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"}`}
            title={loading ? "Downloading..." : "Download document"}>
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

function processDocumentReferences(content: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    DOCUMENT_REF_REGEX.lastIndex = 0;
    while ((match = DOCUMENT_REF_REGEX.exec(content)) !== null) {
        if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
        const fileId = match[1];
        parts.push(<DocumentLink key={`doc-${fileId}-${match.index}`} fileId={fileId} />);
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    if (parts.length === 0) return content;
    return <>{parts}</>;
}

// Suppress unused warning — used by MarkdownMessage indirectly
void processDocumentReferences;

const MessageBubble = memo(
    function MessageBubble(props: MessageBubbleProps) {
        const isUser = props.msg.role === "user";
        return (
            <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${props.isLast ? "message-in" : ""}`}>
                <div className={`max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl border backdrop-blur ${isUser
                    ? "bg-primary text-white border-transparent shadow-[0_8px_20px_rgba(233,66,108,0.35)]"
                    : "bg-white/5 text-white/90 border-white/10 shadow-[0_6px_18px_rgba(76,0,255,0.16)]"
                    }`}>
                    <div>
                        {isUser ? (
                            <p className="whitespace-pre-wrap">{(() => {
                                const c = props.msg.content;
                                const alertMatch = c.match(/^###alert###(.+?)###$/);
                                if (alertMatch) {
                                    const inner = alertMatch[1];
                                    const protoMatch = inner.match(/Execute (\S+) protocol immediately\.\s*Alert:\s*(.+)/);
                                    if (protoMatch) {
                                        const proto = protoMatch[1].replace(/_/g, ' ').replace(/\b\w/g, (ch: string) => ch.toUpperCase());
                                        return `⚠️ Activated ${proto} protocol for: ${protoMatch[2]}`;
                                    }
                                    return `⚠️ ${inner}`;
                                }
                                return c;
                            })()}</p>
                        ) : (
                            <MarkdownMessage content={props.msg.content} />
                        )}
                    </div>
                    {props.msg.attachment && (
                        <div className="mt-2 space-y-1">
                            {props.msg.attachment.type === "image" && (
                                <img src={props.msg.attachment.url} alt={props.msg.attachment.fileName || "Attached image"} className="max-w-full rounded-xl border border-white/10" />
                            )}
                            {props.msg.attachment.type === "video" && (
                                <video controls playsInline src={props.msg.attachment.url} className="max-w-full rounded-xl border border-white/10" />
                            )}
                            <p className="text-[11px] text-white/60 truncate">{props.msg.attachment.fileName}</p>
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

/** Compact pill that shows which tool the agent is calling */
const ToolCallPill = memo(function ToolCallPill({ toolName }: { toolName: string }) {
    // Map internal tool names to user-friendly labels
    const friendlyNames: Record<string, string> = {
        incident_reporter_agent: "Generating report",
        create_incident_report: "Creating PDF",
        update_incident_report: "Updating report",
        web_search: "Searching web",
        google_search: "Searching Google",
        news_search: "Searching news",
        parse_url: "Reading page",
        check_weather: "Checking weather",
        get_item_information: "Fetching device info",
        get_backend_item_information: "Fetching device info",
        query_sop: "Searching SOPs",
        fetch_vms_usage_documentation: "Fetching VMS docs",
        send_audio_alert: "Sending audio alert",
        send_visual_alert: "Sending visual alert",
        send_email_alert: "Sending email alert",
        send_custom_voice_alert: "Sending voice alert",
        send_door_command: "Sending door command",
        query_alerts: "Querying alerts",
        set_vlm_rule: "Setting analytics rule",
        send_sms_to_user: "Sending SMS",
        query_occupancy: "Checking occupancy",
        query_live_activities: "Checking live activities",
        query_security_insights: "Analyzing security",
        execute_emergency_protocol: "Activating protocol",
    };
    const label = friendlyNames[toolName] || "Processing";
    return (
        <div className="flex justify-start message-in">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur">
                <svg className="w-3.5 h-3.5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-[12px] font-medium text-primary/90">⚙️ {label}…</span>
            </div>
        </div>
    );
});

// ─── Bottom sheet config type ───────────────────────────────────────────────
type SheetConfig = {
    title: string;
    icon: string;
    sheetType: "standard" | "strobe" | "protocol" | "incident" | "direct" | "zone_doors";
    items: any[];
    allPayloadType?: string;
    allMessage?: string;
    itemPayloadType?: string;
    itemLabelPrefix?: string;
};

export default function AuthenticatedChatWindow() {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [connected, setConnected] = useState(false);
    const [activeToolName, setActiveToolName] = useState<string | null>(null);
    const [actionsOpen, setActionsOpen] = useState(false);
    const [quickActionsData, setQuickActionsData] = useState<Record<string, any>>({});
    const [loadingActions, setLoadingActions] = useState(false);
    const [actionsRefreshKey, setActionsRefreshKey] = useState(0);
    const [accessZonesData, setAccessZonesData] = useState<any[]>([]);
    const [activeSheet, setActiveSheet] = useState<SheetConfig | null>(null);
    const [expandedSite, setExpandedSite] = useState<string | null>(null);

    // ── Live Alerts state ──
    const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
    const [alertsOpen, setAlertsOpen] = useState(false);
    const [selectedAlert, setSelectedAlert] = useState<LiveAlert | null>(null);
    const seenAlertIds = useRef<Set<string>>(
        typeof window !== 'undefined' && localStorage.getItem('dismissedAlertIds')
            ? new Set<string>(JSON.parse(localStorage.getItem('dismissedAlertIds')!) as string[])
            : new Set<string>()
    );

    // Helper: dismiss an alert (localStorage + backend seen_by)
    const dismissAlertById = useCallback((alertId: string, notificationId?: string) => {
        // Add to seenAlertIds ref
        seenAlertIds.current.add(alertId);
        // Persist to localStorage
        try {
            localStorage.setItem('dismissedAlertIds', JSON.stringify([...seenAlertIds.current]));
        } catch { }
        // Remove from local list
        setLiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
        // Mark seen on backend if notification_id is available
        if (notificationId && user?.id && user?.customer?.id) {
            const token = getStoredAccessToken();
            if (token) {
                markAlertSeen(notificationId, user.id, user.customer.id, token).catch(() => { });
            }
        }
    }, [user]);

    // ── Speech-to-Text state ──
    const [isListening, setIsListening] = useState(false);
    const isListeningRef = useRef(false);
    const recognitionRef = useRef<any>(null);
    const sendLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sendWasLongPress = useRef(false);

    // Keep ref in sync with state
    useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const streamMsgIdRef = useRef<string | null>(null);
    const tokenQueueRef = useRef<string[]>([]);
    const flushTimerRef = useRef<number | null>(null);
    const flushCompletePendingRef = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
                    if (data.access_zones) setAccessZonesData(data.access_zones);
                }
            } catch (err) {
                console.error("Failed to load quick actions data:", err);
            } finally {
                setLoadingActions(false);
            }
        }
        loadActions();
    }, [user]);

    // Poll for live alerts every 30s
    useEffect(() => {
        if (!user?.customer?.id) return;
        const token = getStoredAccessToken();
        if (!token) return;

        function addAlertIfNew(alert: LiveAlert | null) {
            if (!alert) return;
            // Skip if already dismissed locally
            if (seenAlertIds.current.has(alert.id)) return;
            // Skip if backend says seen by this user
            if (alert.seen_by && Array.isArray(alert.seen_by) && user?.id && alert.seen_by.includes(user.id)) {
                seenAlertIds.current.add(alert.id);
                return;
            }
            setLiveAlerts((prev) => {
                if (prev.some((a) => a.id === alert.id)) return prev;
                const updated = [alert, ...prev];
                updated.sort((a, b) => new Date(b.date_created || '').getTime() - new Date(a.date_created || '').getTime());
                return updated;
            });
        }

        async function pollAlerts() {
            const [eventAlert, notification] = await Promise.all([
                fetchLiveAlerts(user!.customer!.id, token!),
                fetchLastNotification(user!.customer!.id, token!),
            ]);
            addAlertIfNew(eventAlert);
            addAlertIfNew(notification);
        }

        pollAlerts(); // initial fetch
        const interval = setInterval(pollAlerts, 10_000);
        return () => clearInterval(interval);
    }, [user]);

    // Lightweight zone-only refresh — returns fresh zones for immediate use
    async function refreshZones(): Promise<any[] | null> {
        const token = getStoredAccessToken();
        if (!token || !user?.customer?.id) return null;
        const data = await fetchAccessZones(user.customer.id, token);
        if (data?.access_zones) {
            setAccessZonesData(data.access_zones);
            return data.access_zones;
        }
        return null;
    }

    // Protocol action definitions
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
        const welcome = `Hello ${firstName}! Here is what you can do:

- View and manage **cameras**, **doors**, and **sensors**
- Check **system health** across all connected devices
- Access **SOPs** and **incident reports**
- Lock or unlock doors, trigger audio/visual alerts
- Ask me anything in plain language

Use the quick buttons below to get started.`;
        setMessages([{ id: "m1", role: "assistant", content: welcome }]);
    }, [user]);

    // Scroll to bottom on new messages
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    // Also scroll when typing indicator appears
    useEffect(() => {
        if (sending) {
            setTimeout(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            }, 50);
        }
    }, [sending]);

    // WebSocket connection
    useEffect(() => {
        const ws = getAuthWS();
        setConnected(ws.readyState === WebSocket.OPEN);

        const unsubscribe = subscribeAuthWS({
            onMessage: (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // console.log("Auth WS message:", data);

                    // ── Handle tool_info messages ──
                    if (data.type === "tool_info") {
                        const name = data.content?.name || data.content?.id || "";
                        setActiveToolName(name);
                        return;
                    }

                    // ── Handle followup_suggestions ──
                    if (data.type === "followup_suggestions") return;

                    if (data.type !== "message") return;

                    // Clear tool indicator when real content starts arriving
                    setActiveToolName(null);

                    if (!streamMsgIdRef.current) {
                        const newId = crypto.randomUUID();
                        streamMsgIdRef.current = newId;
                        setMessages((prev) => [...prev, { id: newId, role: "assistant", content: "" }]);
                    }
                    if (typeof data.content === "string") {
                        tokenQueueRef.current.push(data.content);
                        scheduleFlush();
                    }
                    if (data.isComplete) {
                        flushCompletePendingRef.current = true;
                        scheduleFlush();
                    }
                } catch {
                    const raw = String(event.data);
                    if (raw.startsWith("Invalid") || raw.startsWith("Error") || raw.includes("pong") || raw.includes("ping")) {
                        // console.log("Auth WS system/error (ignored):", raw);
                        return;
                    }
                    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: raw }]);
                }
            },
            onOpen: () => setConnected(true),
            onClose: () => { setConnected(false); if (!streamMsgIdRef.current) setSending(false); },
            onError: () => setConnected(false),
        });

        return () => {
            unsubscribe();
            if (flushTimerRef.current !== null) { window.clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
        };
    }, []);

    function scheduleFlush() {
        if (flushTimerRef.current !== null) return;
        const tick = () => {
            const msgId = streamMsgIdRef.current;
            if (msgId && tokenQueueRef.current.length > 0) {
                const token = tokenQueueRef.current.shift()!;
                setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: m.content + token } : m));
                requestAnimationFrame(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); });
                flushTimerRef.current = window.setTimeout(tick, 20);
                return;
            }
            if (flushCompletePendingRef.current) {
                flushCompletePendingRef.current = false;
                // Reset stream ID so subsequent messages create new bubbles
                streamMsgIdRef.current = null;
                // Only stop "sending" if no tool call is active
                // (more messages may follow after the tool completes)
                if (!activeToolName) setSending(false);
            }
            flushTimerRef.current = null;
        };
        flushTimerRef.current = window.setTimeout(tick, 10);
    }

    useEffect(() => { return () => { disconnectAuthWS(); }; }, []);

    // ─── Actions ────────────────────────────────────────────────────────────
    function sendQuickAction(text: string, payloadStr?: string) {
        if (!isAuthWSOpen() || sending) return;
        setActionsOpen(false);
        setActiveSheet(null);
        setExpandedSite(null);
        const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
        setMessages((m) => [...m, userMsg]);
        const ws = getAuthWS();
        const userMeta = getAuthUserMeta();
        const messageToSend = payloadStr ? `###quick_actions###${payloadStr}###` : text;
        const payload = { user_uuid: userMeta?.id, message: messageToSend, time: new Date().toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" }), user_meta: userMeta, session_id: getOrCreateSessionId() };
        if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(payload)); setSending(true); }
    }

    function openSheet(cfg: SheetConfig) {
        setExpandedSite(null);
        setActiveSheet(prev => (prev?.title === cfg.title ? null : cfg));
    }

    function openZoneSheet(cfg: Omit<SheetConfig, "items">) {
        const isToggle = activeSheet?.title === cfg.title;
        setExpandedSite(null);
        if (isToggle) { setActiveSheet(null); return; }
        // Open immediately with cached zones, then replace with fresh data
        setActiveSheet({ ...cfg, items: accessZonesData });
        refreshZones().then(fresh => {
            if (fresh) setActiveSheet(prev => prev?.title === cfg.title ? { ...prev, items: fresh } : prev);
        });
    }

    function closeSubmenu() { setActiveSheet(null); setExpandedSite(null); }

    function sendAll(displayMessage: string, payloadType?: string) {
        closeSubmenu();
        if (payloadType) {
            sendQuickAction(displayMessage, JSON.stringify({ type: payloadType, id: "", name: "" }));
        } else {
            sendQuickAction(displayMessage);
        }
    }

    function handleProtocolSubmit(site: any, proto: any) {
        const payload = JSON.stringify({ type: "protocol_execute", site_id: site.id, site_name: site.name, protocol: proto.key, protocol_label: proto.label, color: proto.color, severity: proto.severity });
        sendQuickAction(`Initiating ${proto.label} protocol at ${site.name}`, payload);
    }

    function handleSubItemClick(actionType: string, item: any, labelPrefix: string) {
        const payload = JSON.stringify({ type: actionType, id: item.id, name: item.name || item.title || item.date || "" });
        const itemName = item.name || item.title || item.date || "Selected item";
        sendQuickAction(`${labelPrefix}: ${itemName}`, payload);
    }

    function handleStrobeFlash(item: any, color: string) {
        const payload = JSON.stringify({ type: "notifier_visual_color", id: item.id, name: item.name || "", color });
        sendQuickAction(`Flashing ${color} strobe at ${item.name}`, payload);
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text || !isAuthWSOpen()) return;
        setInput("");
        // Reset textarea height after send
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
        const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
        setMessages((m) => [...m, userMsg]);
        const ws = getAuthWS();
        const userMeta = getAuthUserMeta();
        // Refresh GPS location (3s timeout, non-blocking on failure)
        let locationData: { latitude: number; longitude: number } | undefined;
        try {
            const coords = await requestUserLocation(3000);
            if (coords) locationData = { latitude: coords.latitude, longitude: coords.longitude };
        } catch { /* GPS unavailable — proceed without */ }
        const enrichedMeta = locationData ? { ...userMeta, location: locationData } : userMeta;
        const payload = { user_uuid: userMeta?.id, message: text, time: new Date().toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "short" }), user_meta: enrichedMeta, session_id: getOrCreateSessionId() };
        if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(payload)); setSending(true); }
    }

    // ─── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="relative flex flex-col h-full pb-safe overflow-x-hidden">
            {/* Ambient background */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/30 blur-3xl animate-pulse-slow" />
                <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-accent/25 blur-3xl animate-pulse-slow" style={{ animationDelay: "400ms" }} />
                <div className="absolute bottom-[-4rem] left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-indigo/20 blur-3xl animate-pulse-slow" style={{ animationDelay: "800ms" }} />
                <div className="absolute inset-0 bg-grid opacity-[0.18]" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} aria-label={connected ? "Connected" : "Disconnected"} />
                    <div className="text-sm font-semibold">VARCA</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {/* Live Alerts Button */}
                    <button type="button" onClick={() => { setAlertsOpen((o) => !o); if (actionsOpen) setActionsOpen(false); }}
                        className={`relative inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${alertsOpen ? "bg-white/15 border-white/20 text-white" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"}`}>
                        <span>🔔</span>
                        <span>Alerts</span>
                        <svg className={`w-3 h-3 transition-transform ${alertsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        {liveAlerts.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1 animate-pulse">
                                {liveAlerts.length}
                            </span>
                        )}
                    </button>
                    <button type="button" onClick={() => { setActionsOpen((o) => !o); if (actionsOpen) closeSubmenu(); if (alertsOpen) setAlertsOpen(false); }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${actionsOpen ? "bg-white/15 border-white/20 text-white" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"}`}>
                        <span>⚡</span>
                        <span>Actions</span>
                        <svg className={`w-3 h-3 transition-transform ${actionsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    <div className="text-xs text-white/40">{!connected ? "Reconnecting…" : ""}</div>
                </div>
            </div>

            {/* Live Alerts Panel */}
            {alertsOpen && (
                <div className="px-4 md:px-6 py-4 border-b border-white/[0.08] bg-[#1a1b1e]/60 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-300 relative z-10">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-white/50 font-bold mb-3">Live Alerts</div>
                    {liveAlerts.length === 0 ? (
                        <div className="text-center py-6 text-white/40 text-sm">No live alerts</div>
                    ) : (
                        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                            {liveAlerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className="w-full flex items-start gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] transition-all text-left cursor-pointer"
                                    onClick={() => {
                                        setSelectedAlert(alert);
                                        setAlertsOpen(false);
                                    }}
                                >
                                    <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                        alert.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                            'bg-amber-500/20 text-amber-400'
                                        }`}>
                                        ⚠️
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-medium text-white/90 truncate">{alert.title}</div>
                                        {alert.description && <div className="text-[11px] text-white/50 mt-0.5 line-clamp-2">{alert.description}</div>}
                                        <div className="flex items-center gap-2 mt-1">
                                            {alert.severity && (
                                                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                                    alert.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                                        'bg-yellow-500/20 text-yellow-400'
                                                    }`}>{alert.severity}</span>
                                            )}
                                            {alert.protocol_type && (
                                                <span className="text-[10px] text-white/40">{alert.protocol_type.replace(/_/g, ' ')}</span>
                                            )}
                                            {alert.date_created && (
                                                <span className="text-[10px] text-white/30 ml-auto">{new Date(alert.date_created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            dismissAlertById(alert.id, alert.notification_id);
                                        }}
                                        className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all flex-shrink-0"
                                        title="Dismiss alert"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Quick Actions Panel — button grid */}
            {actionsOpen && (
                <div className="px-4 md:px-6 py-5 border-b border-white/[0.08] bg-[#1a1b1e]/60 backdrop-blur-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 relative z-10">

                    {loadingActions && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1b1e]/70 backdrop-blur-md z-20 rounded-b-xl">
                            <div className="flex items-center gap-2 text-white/70 text-sm font-medium bg-black/20 px-4 py-2 rounded-full border border-white/5 shadow-2xl">
                                <svg className="w-4 h-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span>Loading your devices...</span>
                            </div>
                        </div>
                    )}

                    {/* Actions group */}
                    <div className="text-[10px] uppercase tracking-[0.15em] text-white/50 font-bold ml-1">Actions</div>
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button"
                            onClick={() => openSheet({ title: "Protocols", icon: "🛡️", sheetType: "protocol", items: quickActionsData.sites || [], allPayloadType: "protocols_all", allMessage: "Show me the emergency response protocols" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Protocols" ? "bg-red-500/20 border-red-500/40 text-red-100" : "border-red-500/20 bg-red-500/5 text-red-300 hover:bg-red-500/15"}`}>
                            <span className="text-lg">🛡️</span>
                            <span>Protocols</span>
                        </button>
                        <button type="button"
                            onClick={() => openSheet({ title: "Flash Strobe", icon: "⚡", sheetType: "strobe", items: quickActionsData.notifiers_visual || [], allPayloadType: "notifier_visual_all", allMessage: "Flash all strobes" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Flash Strobe" ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-100" : "border-yellow-500/20 bg-yellow-500/5 text-yellow-300 hover:bg-yellow-500/15"}`}>
                            <span className="text-lg">⚡</span>
                            <span>Flash Strobe</span>
                        </button>
                        <button type="button"
                            onClick={() => openSheet({ title: "Audio Alert", icon: "🔊", sheetType: "standard", items: quickActionsData.notifiers_audio || [], allPayloadType: "notifier_audio_all", allMessage: "Send audio alert to all speakers", itemPayloadType: "notifier_audio", itemLabelPrefix: "Play alert at" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Audio Alert" ? "bg-orange-500/20 border-orange-500/40 text-orange-100" : "border-orange-500/20 bg-orange-500/5 text-orange-300 hover:bg-orange-500/15"}`}>
                            <span className="text-lg">🔊</span>
                            <span>Audio Alert</span>
                        </button>
                        <button type="button" onClick={() => sendAll("Send an email alert")}
                            className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/60 text-[11px] font-medium hover:bg-white/[0.08] hover:text-white transition-all duration-300 active:scale-95">
                            <span className="text-lg">✉️</span>
                            <span>Email Alert</span>
                        </button>
                        {/* Zone-wide door commands */}
                        <button type="button"
                            onClick={() => openZoneSheet({ title: "Zone Lock", icon: "🔒", sheetType: "standard", allPayloadType: "door_lock_all", allMessage: "Lock down all access zones", itemPayloadType: "zone_lock_single", itemLabelPrefix: "Lock down zone" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Zone Lock" ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-100" : "border-indigo-500/20 bg-indigo-500/5 text-indigo-300 hover:bg-indigo-500/15"}`}>
                            <span className="text-lg">🔒</span>
                            <span>Zone Lock</span>
                        </button>
                        <button type="button"
                            onClick={() => openZoneSheet({ title: "Free Access", icon: "🔓", sheetType: "standard", allPayloadType: "door_unlock_all", allMessage: "Enable free access on all access zones", itemPayloadType: "zone_free_single", itemLabelPrefix: "Free access zone" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Free Access" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-100" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/15"}`}>
                            <span className="text-lg">🔓</span>
                            <span>Free Access</span>
                        </button>
                        <button type="button"
                            onClick={() => openZoneSheet({ title: "Secure Zone", icon: "🟢", sheetType: "standard", allPayloadType: "zone_secure", allMessage: "Return all access zones to normal secure operation", itemPayloadType: "zone_secure_single", itemLabelPrefix: "Secure zone" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Secure Zone" ? "bg-teal-500/20 border-teal-500/40 text-teal-100" : "border-teal-500/20 bg-teal-500/5 text-teal-300 hover:bg-teal-500/15"}`}>
                            <span className="text-lg">🟢</span>
                            <span>Secure Zone</span>
                        </button>
                        <button type="button"
                            onClick={() => openZoneSheet({ title: "Cancel Lock", icon: "❌", sheetType: "standard", allPayloadType: "zone_cancel_lock_down", allMessage: "Cancel lockdown on all access zones", itemPayloadType: "zone_cancel_single", itemLabelPrefix: "Cancel lockdown zone" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Cancel Lock" ? "bg-violet-500/20 border-violet-500/40 text-violet-100" : "border-violet-500/20 bg-violet-500/5 text-violet-300 hover:bg-violet-500/15"}`}>
                            <span className="text-lg">❌</span>
                            <span>Cancel Lock</span>
                        </button>
                    </div>

                    {/* Quick Info group */}
                    <div className="text-[10px] uppercase tracking-[0.15em] text-white/50 font-bold ml-1 mt-4">Quick Info</div>
                    <div className="grid grid-cols-3 gap-2 pb-1">
                        <button type="button"
                            onClick={() => sendAll("Show me the system health dashboard", "system_health_all")}
                            className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/70 text-[11px] font-medium hover:bg-white/[0.08] hover:text-white transition-all duration-300 active:scale-95">
                            <span className="text-lg">🔧</span>
                            <span>System Health</span>
                        </button>
                        <button type="button"
                            onClick={() => openSheet({ title: "Camera Status", icon: "📹", sheetType: "standard", items: quickActionsData.cameras || [], allPayloadType: "camera_all", allMessage: "Show me all cameras and their statuses", itemPayloadType: "camera", itemLabelPrefix: "Status for camera" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Camera Status" ? "bg-blue-500/20 border-blue-500/40 text-blue-100" : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.08] hover:text-white"}`}>
                            <span className="text-lg">📹</span>
                            <span>Cameras</span>
                        </button>
                        <button type="button"
                            onClick={() => openZoneSheet({ title: "Door Status", icon: "\uD83D\uDEAA", sheetType: "zone_doors", allPayloadType: "door_all", allMessage: "Show me all doors and their statuses" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Door Status" ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-100" : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.08] hover:text-white"}`}>
                            <span className="text-lg">🚪</span>
                            <span>Doors</span>
                        </button>
                        <button type="button"
                            onClick={() => openSheet({ title: "SOPs", icon: "📖", sheetType: "standard", items: quickActionsData.documents || [], allPayloadType: "sop_all", allMessage: "Show me all available SOPs", itemPayloadType: "sop", itemLabelPrefix: "Show SOP" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "SOPs" ? "bg-purple-500/20 border-purple-500/40 text-purple-100" : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.08] hover:text-white"}`}>
                            <span className="text-lg">📖</span>
                            <span>SOPs</span>
                        </button>
                        <button type="button"
                            onClick={() => openSheet({ title: "Incident Reports", icon: "📋", sheetType: "incident", items: quickActionsData.incident_reports || [], allPayloadType: "incident_report_all", allMessage: "Show me all incident reports", itemPayloadType: "incident_report", itemLabelPrefix: "Show incident report" })}
                            className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-[11px] font-medium transition-all duration-300 active:scale-95 ${activeSheet?.title === "Incident Reports" ? "bg-rose-500/20 border-rose-500/40 text-rose-100" : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.08] hover:text-white"}`}>
                            <span className="text-lg">📋</span>
                            <span>Incidents</span>
                        </button>
                        <button type="button"
                            onClick={() => sendQuickAction("Show me the recent alerts", JSON.stringify({ type: "recent_alerts_all", id: "", name: "" }))}
                            className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/70 text-[11px] font-medium hover:bg-white/[0.08] hover:text-white transition-all duration-300 active:scale-95">
                            <span className="text-lg">🔔</span>
                            <span>Recent Alerts</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ─── BOTTOM SHEET ─── */}
            {activeSheet && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={closeSubmenu} />

                    {/* Sheet panel */}
                    <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[72vh] flex flex-col bg-[#18191c] border-t border-white/10 rounded-t-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.7)] animate-in slide-in-from-bottom duration-300">

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xl">{activeSheet.icon}</span>
                                <span className="text-white font-semibold text-[15px]">{activeSheet.title}</span>
                                {activeSheet.items.length > 0 && (
                                    <span className="text-[11px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">{activeSheet.items.length}</span>
                                )}
                            </div>
                            <button onClick={closeSubmenu} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/60 transition-colors">
                                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Scrollable list */}
                        <div className="overflow-y-auto themed-scroll flex-1">

                            {/* "All" — always first */}
                            {activeSheet.allPayloadType && (
                                <button
                                    onClick={() => sendAll(activeSheet.allMessage!, activeSheet.allPayloadType)}
                                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/5 active:bg-white/10 transition-colors border-b border-white/[0.06]">
                                    <span className="w-9 h-9 flex items-center justify-center rounded-full bg-primary/20 text-primary text-[18px] flex-shrink-0">✦</span>
                                    <div>
                                        <div className="text-white font-medium text-[14px]">All {activeSheet.title}</div>
                                        <div className="text-white/40 text-[11px] mt-0.5">
                                            {activeSheet.sheetType === "protocol"
                                                ? "List all emergency response protocols"
                                                : activeSheet.items.length > 0 ? `Apply to all ${activeSheet.items.length} devices` : "Apply to all devices"}
                                        </div>
                                    </div>
                                </button>
                            )}

                            {/* Protocol: site → protocol list */}
                            {activeSheet.sheetType === "protocol" && activeSheet.items.map((site: any) => (
                                <div key={site.id} className="border-b border-white/[0.05] last:border-0">
                                    <button
                                        onClick={() => setExpandedSite(prev => prev === site.id ? null : site.id)}
                                        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${expandedSite === site.id ? "bg-white/5 text-white" : "text-white/80 hover:bg-white/[0.04]"}`}>
                                        <span className="font-medium text-[14px]">{site.name}</span>
                                        <svg viewBox="0 0 24 24" className={`w-4 h-4 opacity-40 transition-transform ${expandedSite === site.id ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                                        </svg>
                                    </button>
                                    {expandedSite === site.id && (
                                        <div className="px-3 pb-3 pt-2 bg-black/30 space-y-2">
                                            {/* Row 1: Fire + Active Shooter */}
                                            <div className="flex gap-2">
                                                {[protocolActions[0], protocolActions[1]].map(proto => (
                                                    <button key={proto.key}
                                                        onClick={() => { handleProtocolSubmit(site, proto); closeSubmenu(); }}
                                                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 border border-red-500/20 text-white/90 text-[12px] font-medium transition-colors">
                                                        <span className="text-xl">{proto.icon}</span>
                                                        <span className="text-center leading-tight">{proto.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Row 2: Fall/Medical + Intrusion */}
                                            <div className="flex gap-2">
                                                {[protocolActions[2], protocolActions[3]].map(proto => (
                                                    <button key={proto.key}
                                                        onClick={() => { handleProtocolSubmit(site, proto); closeSubmenu(); }}
                                                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 active:bg-yellow-500/30 border border-yellow-500/20 text-white/90 text-[12px] font-medium transition-colors">
                                                        <span className="text-xl">{proto.icon}</span>
                                                        <span className="text-center leading-tight">{proto.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Row 3: General Alert — full width */}
                                            <div>
                                                <button
                                                    onClick={() => { handleProtocolSubmit(site, protocolActions[4]); closeSubmenu(); }}
                                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 active:bg-orange-500/30 border border-orange-500/20 text-white/90 text-[12px] font-medium transition-colors">
                                                    <span className="text-xl">{protocolActions[4].icon}</span>
                                                    <span>{protocolActions[4].label}</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Strobe: color buttons per device */}
                            {activeSheet.sheetType === "strobe" && activeSheet.items.map((item: any) => (
                                <div key={item.id} className="flex flex-col px-5 py-4 border-b border-white/[0.05] last:border-0">
                                    <span className="text-[13px] text-white/80 font-medium mb-3 truncate">{item.name}</span>
                                    <div className="flex items-center gap-2">
                                        {(["green", "yellow", "red"] as const).map((color) => {
                                            const cls = color === "green"
                                                ? "bg-emerald-500/25 hover:bg-emerald-500/50 border-emerald-500/40 text-emerald-400"
                                                : color === "yellow"
                                                    ? "bg-yellow-500/25 hover:bg-yellow-500/50 border-yellow-500/40 text-yellow-400"
                                                    : "bg-red-500/25 hover:bg-red-500/50 border-red-500/40 text-red-400";
                                            return (
                                                <button key={color}
                                                    onClick={() => { handleStrobeFlash(item, color); closeSubmenu(); }}
                                                    className={`flex-1 py-2.5 rounded-xl border text-[11px] font-bold tracking-wider text-center transition-colors capitalize ${cls}`}>
                                                    {color}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            {/* Incident: id + date + status badge */}
                            {activeSheet.sheetType === "incident" && activeSheet.items.map((item: any) => (
                                <button key={item.id}
                                    onClick={() => { handleSubItemClick(activeSheet.itemPayloadType!, item, activeSheet.itemLabelPrefix!); closeSubmenu(); }}
                                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 active:bg-white/10 border-b border-white/[0.05] last:border-0 transition-colors">
                                    <div>
                                        <div className="text-[13px] text-white/90 font-medium">Report {item.id.slice(0, 8)}</div>
                                        {item.date && <div className="text-[11px] text-white/40 mt-0.5">{item.date}</div>}
                                    </div>
                                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold ${item.status === "open" ? "bg-red-500/20 text-red-400" : item.status === "closed" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/50"}`}>
                                        {item.status}
                                    </span>
                                </button>
                            ))}

                            {/* Standard: plain item list */}
                            {activeSheet.sheetType === "standard" && activeSheet.items.map((item: any) => {
                                const statusColor = (() => {
                                    const s = item.status;
                                    if (!s) return null;
                                    if (s === "lock_down") return "bg-red-500/20 text-red-400";
                                    if (s === "free") return "bg-blue-500/20 text-blue-400";
                                    if (s === "secure" || s === "online" || s === "connected") return "bg-emerald-500/20 text-emerald-400";
                                    return "bg-white/10 text-white/50";
                                })();
                                const statusLabel = item.status === "lock_down" ? "locked" : item.status === "cancel_lock_down" ? "secure" : item.status;
                                return (
                                    <button key={item.id}
                                        onClick={() => { handleSubItemClick(activeSheet.itemPayloadType!, item, activeSheet.itemLabelPrefix!); closeSubmenu(); }}
                                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 active:bg-white/10 border-b border-white/[0.05] last:border-0 transition-colors">
                                        <span className="text-[14px] text-white/90 truncate pr-3">{item.name || item.title}</span>
                                        {statusColor && (
                                            <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${statusColor}`}>
                                                {statusLabel}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}

                            {/* Zone-Doors: zone accordion → individual doors */}
                            {activeSheet.sheetType === "zone_doors" && activeSheet.items.map((zone: any) => (
                                <div key={zone.id} className="border-b border-white/[0.05] last:border-0">
                                    <button
                                        onClick={() => setExpandedSite(prev => prev === String(zone.id) ? null : String(zone.id))}
                                        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${expandedSite === String(zone.id) ? "bg-white/5 text-white" : "text-white/80 hover:bg-white/[0.04]"}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-white/30 text-base">🚪</span>
                                            <span className="font-medium text-[14px]">{zone.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {zone.status && (() => {
                                                const s = zone.status;
                                                const color = s === "lock_down" ? "bg-red-500/20 text-red-400" : s === "free" ? "bg-blue-500/20 text-blue-400" : s === "secure" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/50";
                                                const label = s === "lock_down" ? "locked" : s;
                                                return <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold ${color}`}>{label}</span>;
                                            })()}
                                            <span className="text-[11px] text-white/35">{zone.doors?.length || 0}</span>
                                            <svg viewBox="0 0 24 24" className={`w-4 h-4 opacity-35 transition-transform ${expandedSite === String(zone.id) ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                                            </svg>
                                        </div>
                                    </button>
                                    {expandedSite === String(zone.id) && (
                                        <div className="bg-black/20">
                                            {(zone.doors || []).map((door: any) => (
                                                <button key={door.id}
                                                    onClick={() => { handleSubItemClick("door", door, "Status for door"); closeSubmenu(); }}
                                                    className="w-full flex items-center justify-between pl-10 pr-5 py-3 text-left hover:bg-white/5 active:bg-white/10 border-b border-white/[0.04] last:border-0 transition-colors">
                                                    <span className="text-[13px] text-white/85 truncate pr-3">{door.name}</span>
                                                    {door.status && (
                                                        <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${door.status === "connected" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                                                            {door.status === "connected" ? "online" : door.status}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                            {(!zone.doors || zone.doors.length === 0) && (
                                                <div className="pl-10 pr-5 py-3 text-white/30 text-[12px]">No doors in this zone</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Empty state */}
                            {activeSheet.items.length === 0 && activeSheet.sheetType !== "direct" && (
                                <div className="px-5 py-10 text-center text-white/40 text-[13px]">
                                    {loadingActions ? "Loading devices..." : "No devices found"}
                                </div>
                            )}
                        </div>

                        {/* iPhone home bar safe area */}
                        <div className="pb-6 flex-shrink-0" />
                    </div>
                </>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="themed-scroll overscroll-contain flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4">
                {messages.map((m, i) => (
                    <MessageBubble key={m.id} msg={m} isLast={i === messages.length - 1} />
                ))}
                {activeToolName && <ToolCallPill toolName={activeToolName} />}
                {sending && <TypingIndicator />}

                {/* Quick chips — shown only when no conversation started yet */}
                {messages.length === 1 && !sending && (
                    <div className="pt-2 w-full">
                        <button
                            onClick={() => sendQuickAction("I need to create a new incident report")}
                            disabled={!connected}
                            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-[13px] font-semibold bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-white/90 hover:from-primary/30 hover:to-accent/30 hover:text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <span className="text-base">📝</span>
                            <span>Create Incident Report</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="px-4 md:px-6 py-3 sm:py-4 border-t border-white/10 bg-[#121213]">
                <div className="flex items-end gap-2 sm:gap-3">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            // Auto-resize: reset then clamp to max 2 lines
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 48 + 24) + 'px'; // ~2 lines
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend(e as any);
                            }
                        }}
                        placeholder="What's happening?"
                        rows={1}
                        className="flex-1 min-w-0 min-h-[48px] max-h-[72px] rounded-xl bg-[#141415] border border-white/10 px-4 py-3 outline-none appearance-none placeholder:text-white/60 text-[14px] leading-6 focus:ring-2 focus:ring-primary/30 touch-manipulation resize-none overflow-hidden"
                        aria-label="Message"
                    />
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onTouchStart={() => {
                            sendWasLongPress.current = false;
                            sendLongPressTimer.current = setTimeout(() => {
                                sendWasLongPress.current = true;
                                if (isListening) {
                                    setIsListening(false);
                                    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { } recognitionRef.current = null; }
                                } else {
                                    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                                    if (!SR) return;
                                    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { } }
                                    const rec = new SR();
                                    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
                                    let ft = input;
                                    rec.onresult = (ev: any) => {
                                        let interim = '';
                                        for (let i = ev.resultIndex; i < ev.results.length; i++) {
                                            const t = ev.results[i][0].transcript;
                                            if (ev.results[i].isFinal) { ft += (ft ? ' ' : '') + t; } else { interim = t; }
                                        }
                                        setInput(ft + (interim ? ' ' + interim : ''));
                                    };
                                    rec.onerror = (ev: any) => { if (ev.error !== 'no-speech') setIsListening(false); };
                                    rec.onend = () => { if (isListeningRef.current) { try { rec.start(); } catch { } } };
                                    recognitionRef.current = rec;
                                    try { rec.start(); setIsListening(true); } catch { }
                                }
                            }, 800);
                        }}
                        onTouchEnd={() => { if (sendLongPressTimer.current) { clearTimeout(sendLongPressTimer.current); sendLongPressTimer.current = null; } }}
                        onClick={(e) => {
                            if (sendWasLongPress.current) {
                                sendWasLongPress.current = false;
                                return;
                            }
                            if (isListening) {
                                setIsListening(false);
                                if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { } recognitionRef.current = null; }
                                return;
                            }
                            if (connected && input.trim() && !sending) {
                                handleSend(e as unknown as React.FormEvent);
                            }
                        }}
                        className={`h-12 inline-flex items-center justify-center gap-1.5 px-4 md:px-5 flex-shrink-0 touch-manipulation rounded-xl font-semibold text-sm transition-all duration-200 ${isListening ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' : 'btn-primary'
                            }`}
                        aria-label={isListening ? 'Stop listening' : 'Send'}>
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

            {/* ── Event Alert Detail Popup ── */}
            {selectedAlert && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) { setSelectedAlert(null); } }}>
                    <div className="w-full max-w-md bg-[#1c1d20] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                            <div className="flex items-center gap-2.5 min-w-0">
                                {/* Only show icon for notification alerts — event alerts already have icon in title */}
                                {selectedAlert.source === 'notification' && (
                                    <span className="text-xl">⚠️</span>
                                )}
                                <h3 className="text-[15px] font-semibold text-white truncate">{selectedAlert.title}</h3>
                            </div>
                            <button onClick={() => setSelectedAlert(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 transition-colors flex-shrink-0">
                                ✕
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">

                            {/* Row 1: Severity + Protocol — same line */}
                            {(selectedAlert.severity || selectedAlert.protocol_type) && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {selectedAlert.severity && (
                                        <span className={`inline-block text-[10px] uppercase font-bold px-2.5 py-1 rounded-md ${selectedAlert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                            selectedAlert.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                                'bg-yellow-500/20 text-yellow-400'
                                            }`}>{selectedAlert.severity}</span>
                                    )}
                                    {selectedAlert.protocol_type && (
                                        <span className="inline-block text-[10px] uppercase font-bold px-2.5 py-1 rounded-md bg-white/5 text-white/60">
                                            Protocol: {selectedAlert.protocol_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Description */}
                            {selectedAlert.description && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Description</div>
                                    <div className="text-[13px] text-white/80 leading-relaxed">{selectedAlert.description}</div>
                                </div>
                            )}

                            {/* Row 3: Event + Reported By — side by side */}
                            {(selectedAlert.activity_name || selectedAlert.reporter_name) && (
                                <div className="grid grid-cols-2 gap-3">
                                    {selectedAlert.activity_name && (
                                        <div>
                                            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Event</div>
                                            <div className="text-[13px] text-white/80 flex items-center gap-1.5">
                                                <span>📅</span> {selectedAlert.activity_name}
                                            </div>
                                        </div>
                                    )}
                                    {selectedAlert.reporter_name && (
                                        <div>
                                            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Reported by</div>
                                            <div className="text-[13px] text-white/80 flex items-start gap-1.5">
                                                <span className="mt-0.5">👤</span>
                                                <div>
                                                    <div>{selectedAlert.reporter_name}</div>
                                                    {selectedAlert.reporter_email && <div className="text-white/40 text-[11px] mt-0.5 break-all">{selectedAlert.reporter_email}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Row 4: Time — single line */}
                            {selectedAlert.date_created && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Time</div>
                                    <div className="text-[13px] text-white/80">{new Date(selectedAlert.date_created).toLocaleString()}</div>
                                </div>
                            )}

                            {/* Row 5: Claimed Location — single line */}
                            {selectedAlert.location && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Claimed Location</div>
                                    <div className="text-[13px] text-white/80 flex items-center gap-1.5">
                                        <span>📍</span> {selectedAlert.location}
                                    </div>
                                </div>
                            )}

                            {/* Row 6: Observed Location — single line, wrap allowed */}
                            {selectedAlert.observed_location && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Observed Location</div>
                                    <div className="text-[13px] text-white/80 flex items-start gap-1.5 break-words">
                                        <span className="flex-shrink-0">🎯</span> <span>{selectedAlert.observed_location}</span>
                                    </div>
                                </div>
                            )}

                            {/* Triggers — for notification alerts */}
                            {selectedAlert.triggers && selectedAlert.triggers.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Triggers</div>
                                    <div className="text-[13px] text-white/80 space-y-0.5">
                                        {selectedAlert.triggers.map((t, i) => (
                                            <div key={i} className="flex items-center gap-1.5"><span>🎯</span> {t}</div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Actions — for notification alerts */}
                            {selectedAlert.actions && selectedAlert.actions.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Actions Taken</div>
                                    <div className="text-[13px] text-white/80 space-y-0.5">
                                        {selectedAlert.actions.map((a, i) => (
                                            <div key={i} className="flex items-center gap-1.5"><span>⚡</span> {a}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="px-5 py-4 border-t border-white/[0.08] space-y-3">
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        dismissAlertById(selectedAlert.id, selectedAlert.notification_id);
                                        setSelectedAlert(null);
                                    }}
                                    className="flex-1 py-3 rounded-xl text-[13px] font-semibold bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all active:scale-[0.98]"
                                >
                                    Dismiss
                                </button>
                                <button
                                    onClick={() => {
                                        const title = selectedAlert.title || 'Alert';
                                        const loc = selectedAlert.location ? ` at ${selectedAlert.location}` : '';
                                        const time = selectedAlert.date_created ? ` on ${new Date(selectedAlert.date_created).toLocaleString()}` : '';
                                        const desc = selectedAlert.description ? ` — ${selectedAlert.description}` : '';
                                        const userMsg = `🔔 Alert: ${title}${loc}${time}.${desc} What should I know about this alert?`;
                                        sendAll(userMsg);
                                        dismissAlertById(selectedAlert.id, selectedAlert.notification_id);
                                        setSelectedAlert(null);
                                    }}
                                    className="flex-1 py-3 rounded-xl text-[13px] font-semibold bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-all active:scale-[0.98]"
                                >
                                    💬 Ask Varca
                                </button>
                            </div>
                            {selectedAlert.protocol_type && (
                                <button
                                    onClick={() => {
                                        const protocolType = selectedAlert.protocol_type!;
                                        const protocolLabels: Record<string, string> = {
                                            fire: '🔥 Fire Alert',
                                            active_shooter: '🔫 Active Shooter',
                                            fall_medical: '🏥 Medical Emergency',
                                            intrusion: '🚨 Intrusion Alert',
                                            general_alert: '⚠️ General Alert',
                                        };
                                        const protocolColors: Record<string, string> = {
                                            fire: 'red', active_shooter: 'red',
                                            fall_medical: 'blue', intrusion: 'red', general_alert: 'red',
                                        };
                                        const payload = JSON.stringify({
                                            type: 'protocol_execute',
                                            protocol: protocolType,
                                            protocol_label: protocolLabels[protocolType] || '⚠️ Alert',
                                            site_id: selectedAlert.site_id || '',
                                            site_name: selectedAlert.site_name || selectedAlert.activity_name || 'Event',
                                            color: protocolColors[protocolType] || 'red',
                                            severity: 9,
                                            activity_id: selectedAlert.activity_id || '',
                                        });
                                        const friendlyLabel = protocolLabels[protocolType] || '⚠️ Alert';
                                        const siteName = selectedAlert.site_name || selectedAlert.activity_name || 'the site';
                                        sendQuickAction(`Activating ${friendlyLabel} protocol at ${siteName}`, payload);
                                        dismissAlertById(selectedAlert.id, selectedAlert.notification_id);
                                        setSelectedAlert(null);
                                    }}
                                    className="w-full py-3 rounded-xl text-[13px] font-semibold bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all active:scale-[0.98]"
                                >
                                    ⚠️ Activate {selectedAlert.protocol_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Protocol
                                </button>
                            )}

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
