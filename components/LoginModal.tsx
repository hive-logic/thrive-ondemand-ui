"use client";

import React, { useState, useId } from "react";
import { useAuth } from "./AuthContext";

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
    const { login } = useAuth();
    const emailId = useId();
    const passwordId = useId();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password || submitting) return;

        setSubmitting(true);
        setError(null);

        try {
            await login(email, password);
            onSuccess?.();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
        } finally {
            setSubmitting(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={handleBackdropClick}
        >
            <div className="card w-full max-w-md p-6 md:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span className="text-sm text-white/80">Thrive</span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-semibold text-white">Welcome back</h2>
                    <p className="text-sm text-white/60">Sign in to access your dashboard</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
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
                                placeholder="you@company.com"
                                autoComplete="email"
                                autoFocus
                                className="w-full rounded-xl bg-[#141415] border border-white/10 pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/40 caret-primary text-[16px] leading-6 appearance-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-white/70" htmlFor={passwordId}>
                            Password
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <rect
                                        x="5"
                                        y="11"
                                        width="14"
                                        height="10"
                                        rx="2"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                    />
                                    <path
                                        d="M8 11V7a4 4 0 1 1 8 0v4"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                    />
                                    <circle cx="12" cy="16" r="1.5" fill="currentColor" />
                                </svg>
                            </span>
                            <input
                                id={passwordId}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                className="w-full rounded-xl bg-[#141415] border border-white/10 pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-accent/40 caret-accent text-[16px] leading-6 appearance-none"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 text-center">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={!email || !password || submitting}
                        className="w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all bg-gradient-to-tr from-primary to-accent hover:brightness-110 shadow-[0_10px_25px_rgba(233,66,108,0.25)]"
                    >
                        {submitting ? "Signing in…" : "Sign in"}
                    </button>
                </form>

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
                    aria-label="Close"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}
