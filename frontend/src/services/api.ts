import axios from 'axios';
import { API_BASE_URL } from '@/config/env';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(
    (config) => {
        const token = sessionStorage.getItem('token');
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

let lastForbiddenAlert = 0;
const notifyForbidden = () => {
    const now = Date.now();
    if (now - lastForbiddenAlert < 3000) return;
    lastForbiddenAlert = now;
    window.dispatchEvent(new CustomEvent('app:forbidden'));
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 403) {
            notifyForbidden();
            window.dispatchEvent(new CustomEvent('app:refresh-me'));
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            
            // Remove token and redirect on 401
            sessionStorage.removeItem('token');
            window.location.href = '/login';
            return Promise.reject(error);
        }

        return Promise.reject(error);
    }
);

export default api;
