// Единая точка хранения access-токена.
// Используем localStorage (а не sessionStorage), чтобы вкладки одного браузера
// делили один токен/jti — иначе single-active-session вытесняет соседние вкладки.
const TOKEN_KEY = 'token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);

export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);
