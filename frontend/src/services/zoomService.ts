import api from './api';

export interface ZoomJoinResponse {
    signature: string;
    sdk_key: string;
    meeting_number: string;
    passcode?: string | null;
    /** SDK ishga tushmaganda «Zoom ilovasida ochish» uchun. */
    join_url: string;
    topic: string;
}

export const zoomService = {
    /**
     * Imzo dars bo'yicha so'raladi: uchrashuv raqamini mijoz emas, server
     * aniqlaydi va ruxsatni tekshiradi.
     */
    join: async (lessonId: number) => {
        const response = await api.post<ZoomJoinResponse>('/integration/zoom/join', { lesson_id: lessonId });
        return response.data;
    },
};
