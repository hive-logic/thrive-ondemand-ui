"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import dynamic from "next/dynamic";

const AuthenticatedChatWindow = dynamic(
    () => import("@/components/AuthenticatedChatWindow"),
    { ssr: false }
);

export default function DashboardPage() {
    const { user, isAuthenticated, isLoading, logout } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Redirect to home if not authenticated
    useEffect(() => {
        if (mounted && !isLoading && !isAuthenticated) {
            router.replace("/");
        }
    }, [mounted, isLoading, isAuthenticated, router]);

    // Show loading while checking auth
    if (!mounted || isLoading) {
        return (
            <main className="h-screen-fixed flex flex-col bg-black text-white">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-white/70 text-sm">Loading…</div>
                </div>
            </main>
        );
    }

    // Not authenticated - will redirect
    if (!isAuthenticated || !user) {
        return (
            <main className="h-screen-fixed flex flex-col bg-black text-white">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-white/70 text-sm">Redirecting…</div>
                </div>
            </main>
        );
    }

    const handleLogout = async () => {
        await logout();
        router.replace("/");
    };

    return (
        <main className="h-screen-fixed flex flex-col overflow-hidden pt-safe bg-black text-white">
            {/* Header */}
            <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-black/20 border-b border-white/10 shrink-0">
                <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span className="text-sm text-white/80">Thrive</span>
                        <span className="text-xs text-white/40 px-2 py-0.5 rounded bg-white/5 ml-2">
                            Dashboard
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2">
                            <span className="text-sm text-white/70">
                                {user.first_name
                                    ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}`
                                    : user.email}
                            </span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="text-sm px-3 py-1.5 rounded-lg border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition-colors"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Chat Area */}
            <div className="flex-1 min-h-0">
                <div className="max-w-5xl mx-auto px-0 md:px-4 py-0 h-full min-h-0">
                    <div className="h-full overflow-hidden relative rounded-none border border-white/10 md:border-0 md:rounded-2xl md:gradient-border md:bg-[#1b1b1c]">
                        <AuthenticatedChatWindow />
                    </div>
                </div>
            </div>
        </main>
    );
}
