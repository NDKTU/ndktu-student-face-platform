import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import { userService } from '@/services/userService';
import { getToken, setToken, clearToken } from '@/services/tokenStorage';
import { logger } from '@/utils/logger';
import type { User, UserRole } from '@/types/auth';

/** Tanlangan ko'rinish foydalanuvchiga bog'lab saqlanadi: bitta brauzerda
 *  boshqa hisobga kirilganda oldingi tanlov qo'llanib qolmasligi kerak. */
const activeRoleKey = (userId: number) => `activeRole:${userId}`;

const readStoredRole = (userId: number): number | null => {
    try {
        const raw = localStorage.getItem(activeRoleKey(userId));
        return raw ? Number(raw) : null;
    } catch {
        return null;
    }
};

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    permissions: ReadonlySet<string>;
    /** Faol ko'rinish roli. Bir nechta roli borlar uchun interfeys shunga qarab torayadi. */
    activeRole: UserRole | null;
    availableRoles: UserRole[];
    setActiveRole: (roleId: number | null) => void;
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
    const [activeRoleId, setActiveRoleId] = useState<number | null>(null);

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

    const availableRoles = useMemo<UserRole[]>(() => user?.roles ?? [], [user]);

    // Saqlangan tanlov foydalanuvchida qolmagan bo'lishi mumkin (rollari
    // o'zgargan) — bunday holda hech narsa toraytirilmaydi.
    const activeRole = useMemo<UserRole | null>(
        () => availableRoles.find((role) => role.id === activeRoleId) ?? null,
        [availableRoles, activeRoleId],
    );

    useEffect(() => {
        if (!user) {
            setActiveRoleId(null);
            return;
        }
        const stored = readStoredRole(user.id);
        const roles = user.roles ?? [];
        if (stored !== null && roles.some((role) => role.id === stored)) {
            setActiveRoleId(stored);
            return;
        }
        // Ko'rinish har doim aniq bo'lsin: saqlangan tanlov bo'lmasa, huquqi
        // eng keng rol olinadi — shunda foydalanuvchi hech narsani yo'qotmaydi,
        // kerak bo'lsa o'zi torroq ko'rinishga o'tadi.
        const widest = roles.reduce<UserRole | null>(
            (best, role) =>
                best === null || (role.permissions?.length ?? 0) > (best.permissions?.length ?? 0) ? role : best,
            null,
        );
        setActiveRoleId(widest?.id ?? null);
    }, [user]);

    const setActiveRole = (roleId: number | null) => {
        setActiveRoleId(roleId);
        if (!user) return;
        try {
            if (roleId === null) localStorage.removeItem(activeRoleKey(user.id));
            else localStorage.setItem(activeRoleKey(user.id), String(roleId));
        } catch {
            // xotira mavjud bo'lmasa ham tanlov joriy sessiyada ishlaydi
        }
    };

    const permissions = useMemo<ReadonlySet<string>>(() => {
        const set = new Set<string>();
        if (!user) return set;
        // Ko'rinish tanlanganda faqat o'sha rolning huquqlari hisobga olinadi.
        const source = activeRole ? [activeRole] : (user.roles ?? []);
        for (const role of source) {
            for (const p of role.permissions ?? []) {
                set.add(p.name);
            }
        }
        return set;
    }, [user, activeRole]);

    const hasPermission = (name: string) => permissions.has(name);
    const hasAnyPermission = (...names: string[]) => names.some((n) => permissions.has(n));

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated,
                isLoading,
                permissions,
                activeRole,
                availableRoles,
                setActiveRole,
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
