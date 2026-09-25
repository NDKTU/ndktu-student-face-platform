import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { setActiveRoleHeader } from '@/services/api';
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
    logout: (options?: { revoke?: boolean }) => void;
    refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    /** Shu sessiyada qo'lda tanlangan rol; `null` — saqlangan yoki sukutdagi. */
    const [chosenRoleId, setChosenRoleId] = useState<number | null>(null);
    const queryClient = useQueryClient();

    const fetchUser = async () => {
        try {
            const response = await api.get<User>('/user/me');
            setUser(response.data);
        } catch (error: unknown) {
            const status = (error as { response?: { status?: number } } | null)?.response?.status;
            if (status === 401) {
                // Token is truly invalid — log the user out. Сессия на сервере
                // уже мертва, отзывать нечего.
                logout({ revoke: false });
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

    /**
     * Выход: сначала отзываем сессию на сервере, потом чистим локальное состояние.
     *
     * Токен снимается ДО `clearToken()` и передаётся в запрос явно. Раньше
     * `userService.logout()` вызывался без await, а `clearToken()` шёл следом
     * синхронно: request-интерсептор читает хранилище уже в момент отправки,
     * поэтому запрос уходил без `Authorization`, получал 401 — и ключ
     * `user:session:{id}` оставался в Redis. Старый JWT после «выхода»
     * продолжал открывать `/user/me` со всеми правами.
     *
     * Ответ не ждём: UI гасится сразу, а запрос уже несёт заголовок, так что
     * порядок больше ничего не решает.
     *
     * `revoke: false` — для случая, когда сервер сам уже сказал 401: сессии
     * там нет, а лишний заведомо неудачный запрос только шумит в логах.
     */
    // `useCallback` — не украшение: `useIdleTimeout` держит logout в зависимостях
    // таймера, а провайдер перерисовывается как минимум раз в минуту (интервальный
    // fetchUser). Новая ссылка на каждом рендере перезапускала бы отсчёт
    // бездействия, и выход по таймауту не наступал бы никогда.
    const logout = useCallback((options?: { revoke?: boolean }) => {
        const token = getToken();
        clearToken();
        setUser(null);
        setChosenRoleId(null);
        // Bug#14 fix: always clear loading state on explicit logout
        setIsLoading(false);
        if (options?.revoke === false || !token) return;
        userService.logout(token).catch((error: unknown) => {
            // Сеть/сервер недоступны — локально мы уже вышли, но серверная
            // сессия доживёт до idle-TTL. Это должно быть видно в логах.
            logger.error('Failed to revoke session on logout', error);
        });
    }, []);

    const refreshMe = async () => {
        await fetchUser();
    };

    const isAuthenticated = !!user;

    /**
     * Ko'rinish tanlovidagi rollar tartibi.
     *
     * Uchta asosiy rol doim oldinda va doim bir xil ketma-ketlikda turadi:
     * administratsiya → o'qituvchi → talaba. Bazadan kelgan tartib rollarning
     * `id` siga bog'liq va o'rnatmadan o'rnatmaga o'zgarib ketardi, ro'yxatdagi
     * qator esa har safar boshqa joyda chiqardi. Qolganlari (psixolog, tyutor)
     * shundan keyin, alifbo bo'yicha.
     */
    const availableRoles = useMemo<UserRole[]>(() => {
        const order = ['admin', 'teacher', 'student'];
        const rank = (role: UserRole) => {
            const index = order.indexOf(role.name.toLowerCase());
            return index === -1 ? order.length : index;
        };
        return [...(user?.roles ?? [])].sort(
            (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
        );
    }, [user]);

    /**
     * Faol ko'rinish render paytida hisoblanadi, effektda emas.
     *
     * Effekt ota komponentda bolalarnikidan keyin ishlaydi: foydalanuvchi
     * yuklangan zahoti sahifa o'z so'rovlarini `X-Active-Role` siz yuborar,
     * backend esa barcha rollar bo'yicha (admin sifatida) javob berib,
     * natija keshda qolardi.
     *
     * Tartib: shu sessiyadagi tanlov → saqlangan tanlov → huquqi eng keng
     * rol. Saqlangan tanlov foydalanuvchida qolmagan bo'lishi mumkin
     * (rollari o'zgargan) — unda keyingisiga o'tiladi.
     */
    const activeRole = useMemo<UserRole | null>(() => {
        if (!user) return null;
        const byId = (id: number | null) =>
            id === null ? undefined : availableRoles.find((role) => role.id === id);
        const picked = byId(chosenRoleId) ?? byId(readStoredRole(user.id));
        if (picked) return picked;
        // Ko'rinish har doim aniq bo'lsin: saqlangan tanlov bo'lmasa, huquqi
        // eng keng rol olinadi — shunda foydalanuvchi hech narsani yo'qotmaydi,
        // kerak bo'lsa o'zi torroq ko'rinishga o'tadi.
        return availableRoles.reduce<UserRole | null>(
            (best, role) =>
                best === null || (role.permissions?.length ?? 0) > (best.permissions?.length ?? 0) ? role : best,
            null,
        );
    }, [user, availableRoles, chosenRoleId]);

    // Axios interseptori shu qiymatni o'qiydi; bolalar render bo'lishidan
    // oldin o'rnatilishi kerak (yuqoridagi izohga qarang).
    setActiveRoleHeader(activeRole?.id ?? null);

    const setActiveRole = (roleId: number | null) => {
        setChosenRoleId(roleId);
        if (!user) return;
        try {
            if (roleId === null) localStorage.removeItem(activeRoleKey(user.id));
            else localStorage.setItem(activeRoleKey(user.id), String(roleId));
        } catch {
            // xotira mavjud bo'lmasa ham tanlov joriy sessiyada ishlaydi
        }
        // Keshdagi javoblar oldingi ko'rinish uchun olingan (admin — hamma
        // kurslar/guruhlar). Sarlavha darhol yangilanadi, so'ng kesh qayta so'raladi.
        if (roleId !== null) setActiveRoleHeader(roleId);
        queryClient.resetQueries();
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
