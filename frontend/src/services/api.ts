import axios from 'axios';
import { API_BASE_URL } from '@/config/env';
import { getToken, clearToken, setLogoutReason } from '@/services/tokenStorage';

//: 401 ni o'zi hal qiladigan so'rovlar — global qayta yo'naltirish bularga
//  tegmaydi.
//  Kirish so'rovlarida 401 sessiyaning tugashi emas, noto'g'ri parol.
//  `/user/logout` da esa chiqishni chaqirgan kod tokenni o'zi tozalaydi va
//  o'zi `/login` ga olib boradi; bu yerdagi `location.href` so'rovni yarim
//  yo'lda uzib, sessiyani serverda tirik qoldirardi.
const SELF_HANDLED_401_PATHS = ['/user/login', '/hemis/login', '/user/logout'];

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

        // Kirish so'rovining o'zidagi 401 — «parol noto'g'ri», sessiya
        // tugagani emas. Bu yerda sahifani qayta yuklash formaning endigina
        // qo'ygan xato matnini o'chirib yuboradi: odam bo'sh forma ko'radi va
        // nima bo'lganini tushunmaydi. Xatoni forma o'zi ko'rsatadi.
        const requestUrl: string = originalRequest?.url ?? '';
        const isSelfHandled = SELF_HANDLED_401_PATHS.some((path) => requestUrl.includes(path));

        if (error.response?.status === 401 && !originalRequest._retry && !isSelfHandled) {
            originalRequest._retry = true;

            // Remove token and redirect on 401.
            clearToken();
            // Различаем вытеснение другой сессией, чтобы показать понятное сообщение.
            const detail: string = error.response?.data?.detail ?? '';
            const kickedBySession = detail.includes('Joriy sessiya yakunlandi');
            if (kickedBySession) setLogoutReason('session');
            window.location.href = kickedBySession ? '/login?reason=session' : '/login';
            return Promise.reject(error);
        }

        return Promise.reject(error);
    }
);

export default api;
