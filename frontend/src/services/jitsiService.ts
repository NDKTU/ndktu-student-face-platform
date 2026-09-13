import api from './api';

export interface JitsiJoinResponse {
    room: string;
    domain: string;
    /** SDK ishga tushmaganda «Brauzerda ochish» uchun. */
    join_url: string;
    topic: string;
}

export const jitsiService = {
    /**
     * Xona dars bo'yicha so'raladi: nomni mijoz emas, server aniqlaydi va
     * ruxsatni tekshiradi (Zoom'dagi bilan bir xil qoida).
     */
    join: async (lessonId: number) => {
        const response = await api.post<JitsiJoinResponse>('/integration/jitsi/join', { lesson_id: lessonId });
        return response.data;
    },
};
