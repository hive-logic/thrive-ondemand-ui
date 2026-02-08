"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import {
    DirectusUser,
    login as authLogin,
    logout as authLogout,
    getMe,
    getStoredUser,
    isAuthenticated as checkAuth,
    getValidAccessToken,
} from "@/lib/auth";

interface AuthContextType {
    user: DirectusUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<DirectusUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize auth state from storage
    useEffect(() => {
        async function initAuth() {
            try {
                const storedUser = getStoredUser();
                if (storedUser && checkAuth()) {
                    // Validate token is still good
                    const token = await getValidAccessToken();
                    if (token) {
                        // Refresh user data
                        const freshUser = await getMe(token);
                        setUser(freshUser);
                    } else {
                        setUser(null);
                    }
                }
            } catch {
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        }
        initAuth();
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const result = await authLogin(email, password);
        setUser(result.user);
    }, []);

    const logout = useCallback(async () => {
        await authLogout();
        setUser(null);
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const token = await getValidAccessToken();
            if (token) {
                const freshUser = await getMe(token);
                setUser(freshUser);
            }
        } catch {
            // Ignore errors
        }
    }, []);

    const value: AuthContextType = {
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
