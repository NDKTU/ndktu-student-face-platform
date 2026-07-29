import api from './api';

export interface Permission {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface PermissionListResponse {
    total: number;
    page: number;
    limit: number;
    permissions: Permission[];
}

export const permissionService = {
    getPermissions: async (page = 1, limit = 100, name?: string) => {
        const response = await api.get<PermissionListResponse>('/permission/', {
            params: { page, limit, name },
        });
        return response.data;
    },

    getPermissionById: async (id: number): Promise<Permission> => {
        const response = await api.get<Permission>(`/permission/${id}`);
        return response.data;
    },

    createPermission: async (data: { name: string }) => {
        const response = await api.post('/permission/', data);
        return response.data;
    },

    updatePermission: async (id: number, data: { name: string }) => {
        const response = await api.put(`/permission/${id}`, data);
        return response.data;
    },

    deletePermission: async (id: number) => {
        await api.delete(`/permission/${id}`);
    },
};
