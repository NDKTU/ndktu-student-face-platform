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
