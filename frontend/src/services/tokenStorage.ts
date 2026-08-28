// Единая точка хранения access-токена.
// Используем localStorage (а не sessionStorage), чтобы вкладки одного браузера
// делили один токен/jti — иначе single-active-session вытесняет соседние вкладки.
const TOKEN_KEY = 'token';

// Some browsers/profiles (Firefox strict tracking-protection, private
// browsing, site-data policies) throw SecurityError on any localStorage
// access. getToken() runs on every request via the axios interceptor, so an
// unguarded throw here crashes the whole app — fail closed instead.
export const getToken = (): string | null => {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
};

export const setToken = (token: string): void => {
    try {
        localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // Storage unavailable — session won't persist across reloads, but
        // the app keeps running instead of crashing.
    }
};

export const clearToken = (): void => {
    try {
        localStorage.removeItem(TOKEN_KEY);
    } catch {
        // no-op
    }
};

// Причина выхода переживает гонку двух редиректов: интерсептор ставит
// window.location.href='/login?reason=session', но ProtectedRoute почти сразу
// делает client-side <Navigate to="/login"> без query — и объяснение терялось,
// пользователь оказывался на голой форме входа без единого слова о том, что
// его вытеснили. sessionStorage доносит причину при любом порядке редиректов.
const LOGOUT_REASON_KEY = 'logoutReason';

export const setLogoutReason = (reason: string): void => {
    try {
        sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
    } catch {
        // no-op
    }
};

export const readLogoutReason = (): string | null => {
    try {
        return sessionStorage.getItem(LOGOUT_REASON_KEY);
    } catch {
        return null;
    }
};

export const clearLogoutReason = (): void => {
    try {
        sessionStorage.removeItem(LOGOUT_REASON_KEY);
    } catch {
        // no-op
    }
};
