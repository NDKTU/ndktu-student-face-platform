import api from './api';

/**
 * Zoom akkauntlari (`backend/app/modules/zoom_session/account_router.py`).
 *
 * Har akkauntda ikki ilova bo'ladi va ikkalasi ham SHU akkauntda:
 * Server-to-Server OAuth (uchrashuv yaratish) va General App + Meeting SDK
 * (talabaning sahifadagi kirishi). Sirlar faqat yuboriladi — javobda
 * qaytmaydi, faqat `has_*` bor-yo'qligi.
 */

export interface ZoomAccount {
    /** `0` — serverdagi `.env` dan olingan akkaunt (tahrirlanmaydi). */
    id: number;
    name: string;
    host_email?: string | null;
    api_account_id?: string | null;
    api_client_id?: string | null;
    sdk_key?: string | null;
    has_api_secret: boolean;
    has_sdk_secret: boolean;
    has_webhook_secret: boolean;
    is_active: boolean;
    from_env: boolean;
    api_enabled: boolean;
    sdk_enabled: boolean;
    sessions_count: number;
}

export interface ZoomAccountPayload {
    name: string;
    host_email?: string | null;
    api_account_id?: string | null;
    api_client_id?: string | null;
    /** Bo'sh — saqlangani o'zgarmaydi. */
    api_client_secret?: string | null;
    sdk_key: string;
    sdk_secret?: string | null;
    webhook_secret_token?: string | null;
    is_active: boolean;
}

export interface ZoomAccountCheck {
    api_ok?: boolean | null;
    api_message?: string | null;
    host_email?: string | null;
    host_licensed?: boolean | null;
    sdk_configured: boolean;
}

export const zoomAccountService = {
    list: async () => (await api.get<{ accounts: ZoomAccount[] }>('/zoom-accounts/')).data.accounts,
    create: async (data: ZoomAccountPayload) => (await api.post<ZoomAccount>('/zoom-accounts/', data)).data,
    update: async (id: number, data: ZoomAccountPayload) =>
        (await api.put<ZoomAccount>(`/zoom-accounts/${id}`, data)).data,
    remove: async (id: number) => {
        await api.delete(`/zoom-accounts/${id}`);
    },
    check: async (id: number) => (await api.post<ZoomAccountCheck>(`/zoom-accounts/${id}/check`)).data,
};
