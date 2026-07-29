import axios from 'axios';
import { API_BASE_URL } from '@/config/env';
import { getToken, clearToken } from '@/services/tokenStorage';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(
    (config) => {
        const token = getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 403) {
            // Re-fetch /user/me so a role/permission change made by an admin
            // propagates without a full re-login. Each page's own inline
            // isError state (React Query) surfaces the failure — no global
            // blocking alert here.
            window.dispatchEvent(new CustomEvent('app:refresh-me'));
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            // Remove token and redirect on 401.
            clearToken();
            // Различаем вытеснение другой сессией, чтобы показать понятное сообщение.
            const detail: string = error.response?.data?.detail ?? '';
            const kickedBySession = detail.includes('Joriy sessiya yakunlandi');
            // BASE_URL — Vite'ning `base` sozlamasi. O'tish davrida bu ilova
            // /legacy/ ostida turadi, shuning uchun router'ni chetlab o'tuvchi
            // redirect ham shu prefiksni hisobga olishi kerak.
            window.location.href = kickedBySession
                ? `${import.meta.env.BASE_URL}login?reason=session`
                : `${import.meta.env.BASE_URL}login`;
            return Promise.reject(error);
        }

        return Promise.reject(error);
    }
);

export default api;
