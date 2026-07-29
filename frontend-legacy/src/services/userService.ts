import api from './api';
import type { User } from '@/types/auth';

export interface UserListResponse {
    total: number;
    page: number;
    limit: number;
    users: User[];
}

export const userService = {
    // Отзывает текущую сессию на сервере (удаляет jti из Redis).
    logout: async (): Promise<void> => {
        await api.post('/user/logout');
    },

    getUsers: async (page = 1, limit = 10, username?: string) => {
        const response = await api.get<UserListResponse>('/user/', {
            params: { page, limit, username },
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
