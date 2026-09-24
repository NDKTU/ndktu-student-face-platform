import api from './api';

/** Muallif kursda kim — o'qituvchi xabari chatda ajralib turadi. */
export type CourseMessageAuthorRole = 'teacher' | 'student' | 'admin' | 'other';

export interface CourseMessage {
    id: number;
    course_id: number;
    user_id: number | null;
    author_name: string;
    author_role: CourseMessageAuthorRole;
    body: string;
    created_at: string;
    /** Muallifning o'zi yoki kurs o'qituvchisi/admin. */
    can_delete: boolean;
}

export interface CourseMessageList {
    /** Eskidan yangiga tartibda. */
    messages: CourseMessage[];
    /** Bundan eskiroq xabarlar ham bormi. */
    has_more: boolean;
}

export const COURSE_MESSAGE_MAX_LENGTH = 4000;

export const courseChatService = {
    list: async (courseId: number, beforeId?: number) => {
        const response = await api.get<CourseMessageList>(`/course/${courseId}/messages`, {
            params: beforeId ? { before_id: beforeId } : undefined,
        });
        return response.data;
    },
    send: async (courseId: number, body: string) => {
        const response = await api.post<CourseMessage>(`/course/${courseId}/messages`, { body });
        return response.data;
    },
    remove: async (courseId: number, messageId: number) => {
        await api.delete(`/course/${courseId}/messages/${messageId}`);
    },
};
