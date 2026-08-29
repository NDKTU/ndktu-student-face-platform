import api from './api';

/**
 * Fayl kutubxonasi.
 *
 * Bir marta yuklangan fayl qayta yuklanmasdan boshqa kurs, dars yoki vazifaga
 * qoʻshiladi. Ayni baytlar allaqachon yuklangan boʻlsa server yangi nusxa
 * yaratmaydi — mavjud yozuvni qaytaradi.
 */

/** Fayl qayerda ishlatilyapti. */
export type FileUsageEntity = 'resource' | 'homework' | 'submission' | 'question';

export interface FileUsage {
    entity_type: FileUsageEntity;
    entity_id: number;
    /** Ekranda koʻrsatish uchun nom. Manba topilmasa null. */
    label: string | null;
}

export interface LibraryFile {
    id: number;
    title: string;
    original_name: string;
    url: string;
    size_bytes: number;
    mime_type: string | null;
    folder_id: number | null;
    owner_user_id: number | null;
    usage_count: number;
}

export interface LibraryFileDetail extends LibraryFile {
    usages: FileUsage[];
}

export interface LibraryFolder {
    id: number;
    name: string;
    parent_id: number | null;
    file_count: number;
}

export interface FileListParams {
    folder_id?: number;
    /** Papkaga solinmagan fayllar. folder_id bilan birga ishlatilmaydi. */
    root_only?: boolean;
    search?: string;
    kind?: 'image' | 'document';
    page?: number;
    size?: number;
}

export interface FileListResponse {
    items: LibraryFile[];
    total: number;
    page: number;
    size: number;
}

export const fileService = {
    list: async (params: FileListParams) => {
        const response = await api.get<FileListResponse>('/file/', { params });
        return response.data;
    },

    get: async (id: number) => {
        const response = await api.get<LibraryFileDetail>(`/file/${id}`);
        return response.data;
    },

    upload: async (file: File, folderId?: number) => {
        const form = new FormData();
        form.append('file', file);
        const response = await api.post<LibraryFile>('/file/upload', form, {
            params: folderId ? { folder_id: folderId } : undefined,
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    update: async (id: number, data: { title?: string; folder_id?: number; move_to_root?: boolean }) => {
        const response = await api.patch<LibraryFile>(`/file/${id}`, data);
        return response.data;
    },

    remove: async (id: number) => {
        await api.delete(`/file/${id}`);
    },

    attach: async (id: number, data: { entity_type: FileUsageEntity; entity_id: number }) => {
        const response = await api.post<LibraryFile>(`/file/${id}/attach`, data);
        return response.data;
    },

    detach: async (id: number, data: { entity_type: FileUsageEntity; entity_id: number }) => {
        await api.post(`/file/${id}/detach`, data);
    },

    listFolders: async () => {
        const response = await api.get<{ items: LibraryFolder[] }>('/file/folder/');
        return response.data.items;
    },

    createFolder: async (data: { name: string; parent_id?: number }) => {
        const response = await api.post<LibraryFolder>('/file/folder/', data);
        return response.data;
    },

    updateFolder: async (id: number, data: { name?: string; parent_id?: number }) => {
        const response = await api.put<LibraryFolder>(`/file/folder/${id}`, data);
        return response.data;
    },

    deleteFolder: async (id: number) => {
        await api.delete(`/file/folder/${id}`);
    },
};
