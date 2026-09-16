import api from './api';
import type { User } from '@/types/auth';

export interface UserListResponse {
    total: number;
    page: number;
    limit: number;
    users: User[];
}

/** Foydalanuvchilar ro'yxatining server filtri va saralashi. */
export interface UserListParams {
    role_id?: number;
    sort_by?: 'id' | 'username' | 'created_at';
    order?: 'asc' | 'desc';
}

export const userService = {
    /** Profil surati: yuz nazoratida etalon sifatida shu ishlatiladi. */
    uploadAvatar: async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        const response = await api.post('/user/me/avatar', form);
        return response.data;
    },

    deleteAvatar: async () => {
        const response = await api.delete('/user/me/avatar');
        return response.data;
    },

    // Отзывает текущую сессию на сервере (удаляет jti из Redis).
    //
    // Токен принимается аргументом, а не берётся из хранилища: вызывающий код
    // очищает localStorage сразу, не дожидаясь ответа, а request-интерсептор
    // читает хранилище только в момент отправки. Запрос уходил без заголовка,
    // получал 401 — и jti оставался в Redis, то есть старый JWT продолжал
    // работать после «выхода».
    logout: async (token?: string | null): Promise<void> => {
        await api.post('/user/logout', null, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    },

    getUsers: async (page = 1, limit = 10, username?: string, params?: UserListParams) => {
        const response = await api.get<UserListResponse>('/user/', {
            // Rol filtri va saralash serverda: 10 mingdan ortiq foydalanuvchida
            // sahifaning ichida filtrlash bo'sh ro'yxat berardi.
            params: {
                page,
                limit,
                username,
                role_id: params?.role_id,
                sort_by: params?.sort_by,
                order: params?.sort_by ? (params.order ?? 'asc') : undefined,
            },
        });
        return response.data;
    },

    getUserById: async (id: number): Promise<User> => {
        const response = await api.get<User>(`/user/${id}`);
        return response.data;
    },

    createUser: async (userData: any) => {
        const response = await api.post('/user/', userData);
        return response.data;
    },

    updateUser: async (id: number, userData: any) => {
        const response = await api.put(`/user/${id}`, userData);
        return response.data;
    },

    deleteUser: async (id: number, force?: boolean) => {
        const url = force ? `/user/${id}?force=true` : `/user/${id}`;
        await api.delete(url);
    },

    assignRoles: async (user_id: number, role_ids: number[]) => {
        const response = await api.post('/user/assign_role', { user_id, role_ids });
        return response.data;
    },

    syncHemisUsers: async () => {
        const response = await api.post('/user/sync-hemis');
        return response.data;
    },

    changeMyCredentials: async (data: { current_password: string; new_username?: string; new_password?: string }) => {
        const response = await api.put('/user/me/credentials', data);
        return response.data;
    },
};
