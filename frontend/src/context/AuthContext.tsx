import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { userService } from '@/services/userService';
import { getToken, setToken, clearToken } from '@/services/tokenStorage';
import { logger } from '@/utils/logger';
import type { User } from '@/types/auth';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    permissions: ReadonlySet<string>;
    hasPermission: (name: string) => boolean;
    hasAnyPermission: (...names: string[]) => boolean;
    login: (token: string) => Promise<void>;
    logout: () => void;
    refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchUser = async () => {
        try {
            const response = await api.get<User>('/user/me');
            setUser(response.data);
        } catch (error: unknown) {
            const status = (error as { response?: { status?: number } } | null)?.response?.status;
            if (status === 401) {
                // Token is truly invalid — log the user out.
                logout();
            } else {
                // 429 / 5xx / network error: don't kick the user out, leave
                // user=null so route guards may show a spinner or render fallback.
                logger.error('Failed to fetch user (non-auth error)', error, { status });
                setUser(null);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const token = getToken();
        if (token) {
            fetchUser();
        } else {
            setIsLoading(false);
        }
    }, []);

    // Refresh /user/me when a 403 surfaces (permissions may have changed server-side)
    // and on a 60s interval so that admin updates propagate without re-login.
    useEffect(() => {
        const onForbidden = () => {
            if (getToken()) fetchUser();
        };
        window.addEventListener('app:refresh-me', onForbidden);

        const interval = setInterval(() => {
            if (getToken()) fetchUser();
        }, 60_000);

        return () => {
            window.removeEventListener('app:refresh-me', onForbidden);
            clearInterval(interval);
        };
    }, []);

    const login = async (token: string) => {
        setToken(token);
        await fetchUser();
    };

    const logout = () => {
        // Best-effort серверный отзыв сессии (удаляет jti из Redis); не блокируем UI.
        userService.logout().catch(() => { /* токен всё равно очищаем ниже */ });
        clearToken();
        setUser(null);
        // Bug#14 fix: always clear loading state on explicit logout
        setIsLoading(false);
    };

    const refreshMe = async () => {
        await fetchUser();
    };

    const isAuthenticated = !!user;

    const permissions = useMemo<ReadonlySet<string>>(() => {
        const set = new Set<string>();
        if (!user) return set;
        for (const role of user.roles ?? []) {
            for (const p of role.permissions ?? []) {
                set.add(p.name);
            }
        }
        return set;
    }, [user]);

    const hasPermission = (name: string) => permissions.has(name);
    const hasAnyPermission = (...names: string[]) => names.some((n) => permissions.has(n));

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated,
                isLoading,
                permissions,
                hasPermission,
                hasAnyPermission,
                login,
                logout,
                refreshMe,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
