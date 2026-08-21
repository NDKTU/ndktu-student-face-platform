import api from './api';

export type ResourceType = 'file' | 'link' | 'text' | 'video';

export interface Resource {
    id: number;
    lesson_id?: number | null;
    course_id?: number | null;
    resource_type: ResourceType;
    title: string;
    file_url?: string | null;
    link_url?: string | null;
    text_content?: string | null;
    order_index: number;
    created_at: string;
    updated_at: string;
}

export interface ResourceCreateRequest {
    lesson_id?: number;
    course_id?: number;
    resource_type: ResourceType;
    title: string;
    file_url?: string;
    link_url?: string;
    text_content?: string;
    order_index?: number;
}

export const resourceService = {
    list: async (params: { lesson_id?: number; course_id?: number }) => {
        const response = await api.get<{ total: number; resources: Resource[] }>('/resource/', { params });
        return response.data;
    },
    create: async (data: ResourceCreateRequest) => {
        const response = await api.post<Resource>('/resource/', data);
        return response.data;
    },
    delete: async (id: number) => {
        await api.delete(`/resource/${id}`);
    },
    upload: async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        const response = await api.post<{ url: string }>('/resource/upload', form);
        return response.data;
    },
};
