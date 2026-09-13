import api from './api';

export type FaceCheckStage = 'join' | 'random';
export type FaceCheckStatus =
    | 'ok'
    | 'no_face'
    | 'multiple_faces'
    | 'different_person'
    | 'no_reference'
    | 'no_camera'
    /** Sahifa fonda edi — kadr ishonchsiz, talabani ayblamaydi. */
    | 'page_hidden';

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

/** Yuz ko'rinmagan bir davr. `end === null` — talaba oxirigacha qaytmagan. */
export interface AbsencePeriod {
    start: string;
    end?: string | null;
    duration_seconds: number;
    checks: number;
    statuses: FaceCheckStatus[];
    /** Shu davrda saqlangan suratlar — dalil sifatida davr boshidan 1-2 tasi. */
    image_check_ids: number[];
}

export interface FaceCheckStudentSummary {
    user_id: number;
    user_name?: string | null;
    total: number;
    passed: number;
    failed: number;
    /** Kuzatuv oynasi — talabaning birinchi va oxirgi tekshiruvi. */
    first_check?: string | null;
    last_check?: string | null;
    tracked_seconds: number;
    absent_seconds: number;
    periods: AbsencePeriod[];
    /** Oxirgi davr yopilmagan: yuz qaytmadi. */
    ended_absent: boolean;
    /** Tekshiruvlar erta to'xtagan — brauzer yopilgan bo'lishi mumkin. */
    left_early: boolean;
}

export interface FaceCheckReport {
    lesson_id: number;
    students: FaceCheckStudentSummary[];
}

export const faceCheckService = {
    /** Kadrni serverga yuboradi; qaror serverda qabul qilinadi. */
    run: async (
        lessonId: number,
        payload: {
            image_base64?: string;
            stage: FaceCheckStage;
            camera_unavailable?: boolean;
            /** Sahifa fonda edi — server kadrga qarab qaror qilmaydi. */
            page_hidden?: boolean;
        },
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
