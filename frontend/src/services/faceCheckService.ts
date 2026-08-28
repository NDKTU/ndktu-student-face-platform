import api from './api';

export type FaceCheckStage = 'join' | 'random';
export type FaceCheckStatus =
    | 'ok'
    | 'no_face'
    | 'multiple_faces'
    | 'different_person'
    | 'no_reference'
    | 'no_camera';

export interface FaceCheckResult {
    id: number;
    status: FaceCheckStatus;
    message: string;
}

export interface FaceCheckItem {
    id: number;
    user_id: number;
    user_name?: string | null;
    stage: FaceCheckStage;
    status: FaceCheckStatus;
    has_image: boolean;
    created_at: string;
}

export interface FaceCheckStudentSummary {
    user_id: number;
    user_name?: string | null;
    total: number;
    passed: number;
    failed: number;
    checks: FaceCheckItem[];
}

export interface FaceCheckReport {
    lesson_id: number;
    students: FaceCheckStudentSummary[];
}

export const faceCheckService = {
    /** Kadrni serverga yuboradi; qaror serverda qabul qilinadi. */
    run: async (
        lessonId: number,
        payload: { image_base64?: string; stage: FaceCheckStage; camera_unavailable?: boolean },
    ) => {
        const response = await api.post<FaceCheckResult>(`/lesson/${lessonId}/face-check`, payload);
        return response.data;
    },

    report: async (lessonId: number) => {
        const response = await api.get<FaceCheckReport>(`/lesson/${lessonId}/face-checks`);
        return response.data;
    },

    /** Surat himoyalangan endpoint orqali beriladi — to'g'ridan-to'g'ri havola yo'q. */
    imageUrl: (checkId: number) => `/api/lesson/face-check/${checkId}/image`,
};
