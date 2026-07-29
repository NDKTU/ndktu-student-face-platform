import api from './api';

export interface UploadCheatingImageRequest {
    quiz_id: number;
    user_id: number | null;
    image_data: string; // Base64 encoded JPEG
}

export interface UploadCheatingImageResponse {
    success: boolean;
    image_url?: string;
    message?: string;
}

export const cheatingImageService = {
    uploadCheatingImage: async (data: UploadCheatingImageRequest) => {
        const response = await api.post<UploadCheatingImageResponse>(
            '/quiz_process/upload_cheating_evidence',
            data
        );
        return response.data;
    },
};
