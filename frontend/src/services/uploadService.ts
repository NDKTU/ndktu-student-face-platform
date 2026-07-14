import api from './api';

/**
 * Image upload service.
 *
 * `uploadImage` reuses `POST /question/upload_image` (saves under the
 * "question" folder) — used for quiz/psychology question and option images.
 * `uploadEmployeeImage` uses the dedicated `POST /employee/upload_image`
 * (saves under the "profile" folder) — used for employee profile photos.
 */
export const uploadService = {
    uploadImage: async (file: File): Promise<{ url: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post<{ url: string }>('/question/upload_image', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    uploadEmployeeImage: async (file: File): Promise<{ url: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post<{ url: string }>('/employee/upload_image', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },
};
