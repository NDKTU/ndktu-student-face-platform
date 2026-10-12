import api from './api';
import type { GroupOption, GroupOptionFilter } from './generalTestService';

/**
 * Zoom sahifasi: jonli dars seanslari (havola + guruhlar + vaqt) va ulardagi
 * yuz nazorati (`backend/app/modules/zoom_session`).
 *
 * Kirish qarorini server qiladi: guruh, vaqt va `join` yuz tekshiruvi
 * `ok` bo'lmasa, `join` imzo bermaydi. Brauzer faqat kadr yuboradi.
 */

export type ZoomSessionStatus = 'upcoming' | 'open' | 'closed';
export type ZoomSessionScope = 'now' | 'upcoming' | 'past';

export interface ZoomSession {
    id: number;
    title: string;
    starts_at: string;
    ends_at: string;
    /** Talaba qo'shila oladigan payt — boshlanishdan biroz oldin. */
    opens_at: string;
    status: ZoomSessionStatus;
    subject_id?: number | null;
    subject_name?: string | null;
    /** Darsni olib boradigan o'qituvchi (`users.id`) — yuz tekshiruvisiz kiradi. */
    teacher_user_id?: number | null;
    teacher_name?: string | null;
    groups: { id: number; name: string }[];
    face_check_enabled: boolean;
    is_active: boolean;
    /** Tahrirlash va hisobot — yaratuvchi va admin. */
    can_manage: boolean;
    /** Faqat yaratuvchi va adminga keladi. */
    link_url?: string | null;
    created_by_name?: string | null;
    /** Uchrashuvni LMS Zoom API orqali yaratgan — talaba shaxsiy token bilan kiradi. */
    zoom_managed: boolean;
    /** Faqat yaratuvchi va adminga. `0` — serverdagi `.env` akkaunti. */
    zoom_account_id?: number | null;
    zoom_account_name?: string | null;
}

export interface ZoomAccountOption {
    /** `0` — serverdagi `.env` akkaunti. */
    id: number;
    name: string;
    /** Shu akkauntda uchrashuvni LMS o'zi yarata oladi. */
    auto_create: boolean;
}

export interface ZoomTeacherOption {
    user_id: number;
    name: string;
    kafedra_name?: string | null;
}

export interface ZoomSessionPayload {
    /** `null` — fan, o'qituvchi va guruhlardan server o'zi yasaydi. */
    title: string | null;
    teacher_user_id: number | null;
    /** `null` — uchrashuvni server Zoom API orqali o'zi yaratadi. */
    link_url: string | null;
    /** `null` — avtomatik: bo'sh akkaunt yoki havoladan aniqlanadi. */
    zoom_account_id?: number | null;
    /** ISO, zona bilan (Toshkent vaqti). */
    starts_at: string;
    ends_at: string;
    group_ids: number[];
    subject_id: number | null;
    face_check_enabled: boolean;
    is_active: boolean;
}

export interface ZoomJoinResponse {
    signature: string;
    sdk_key: string;
    meeting_number: string;
    passcode?: string | null;
    topic: string;
    /** Zoom'dagi ism — LMS'dan: «Familiya Ism · Guruh». */
    user_name: string;
    /** Ro'yxatdan o'tish talab qilingan uchrashuvda shaxsiy kirish tokeni (SDK `tk`). */
    registrant_token?: string | null;
    /** SDK `customerKey` — webhook hodisasini foydalanuvchiga bog'laydi. */
    customer_key: string;
}

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
    /** `join` da `ok` — endi `join` imzo beradi. */
    admitted?: boolean;
}

export interface FaceCheckPayload {
    image_base64?: string;
    stage: FaceCheckStage;
    camera_unavailable?: boolean;
    /** Sahifa fonda edi — server kadrga qarab qaror qilmaydi. */
    page_hidden?: boolean;
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
    group_name?: string | null;
    /** Guruhda bor, lekin seansga umuman kirmagan. */
    joined: boolean;
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
    /** Zoom webhook bo'yicha uchrashuvda o'tirgan vaqt; `null` — hodisa yo'q. */
    zoom_seconds?: number | null;
    zoom_first_join?: string | null;
}

/** Uchrashuvda bo'lgan, lekin LMS orqali kirmagan ishtirokchi. */
export interface ZoomOutsider {
    name?: string | null;
    first_join: string;
    seconds: number;
}

export interface FaceCheckReport {
    session_id: number;
    students: FaceCheckStudentSummary[];
    /** Zoom webhook hodisalari kelganmi. */
    zoom_tracked: boolean;
    outsiders: ZoomOutsider[];
}

export const zoomSessionService = {
    list: async (scope?: ZoomSessionScope) =>
        (await api.get<{ sessions: ZoomSession[] }>('/zoom-sessions/', { params: { scope } })).data.sessions,
    get: async (id: number) => (await api.get<ZoomSession>(`/zoom-sessions/${id}`)).data,
    create: async (data: ZoomSessionPayload) => (await api.post<ZoomSession>('/zoom-sessions/', data)).data,
    update: async (id: number, data: ZoomSessionPayload) =>
        (await api.put<ZoomSession>(`/zoom-sessions/${id}`, data)).data,
    remove: async (id: number) => {
        await api.delete(`/zoom-sessions/${id}`);
    },
    /** Zoom API sozlanganmi — havolasiz seans yaratsa bo'ladimi. */
    capabilities: async () =>
        (await api.get<{ auto_create: boolean; accounts: ZoomAccountOption[] }>('/zoom-sessions/capabilities')).data,
    /** Host sifatida boshlash havolasi — faqat LMS yaratgan uchrashuvda. */
    start: async (id: number) =>
        (await api.post<{ start_url: string }>(`/zoom-sessions/${id}/start`)).data,
    /** O'qituvchi tanlash. `locked` — joriy foydalanuvchi o'qituvchi: faqat o'zi. */
    teacherOptions: async (search?: string) =>
        (
            await api.get<{ teachers: ZoomTeacherOption[]; locked: boolean }>('/zoom-sessions/teacher-options', {
                params: { search: search || undefined },
            })
        ).data,
    /** Tanlangan o'qituvchining fanlari. */
    teacherSubjects: async (teacherUserId: number) =>
        (
            await api.get<{ subjects: { id: number; name: string }[] }>('/zoom-sessions/teacher-subjects', {
                params: { teacher_user_id: teacherUserId },
            })
        ).data.subjects,
    /** Guruh tanlashdagi fakultet filtri. */
    filterOptions: async () =>
        (await api.get<{ faculties: { id: number; name: string }[] }>('/zoom-sessions/filter-options')).data,
    groupOptions: async (filter: GroupOptionFilter) =>
        (await api.get<{ groups: GroupOption[] }>('/zoom-sessions/group-options', { params: filter })).data.groups,

    /** Kadrni serverga yuboradi; qaror serverda qabul qilinadi. */
    faceCheck: async (sessionId: number, payload: FaceCheckPayload) =>
        (await api.post<FaceCheckResult>(`/zoom-sessions/${sessionId}/face-check`, payload)).data,
    /** Meeting SDK imzosi — guruh, vaqt va yuz tasdig'idan keyin. */
    join: async (sessionId: number) => (await api.post<ZoomJoinResponse>(`/zoom-sessions/${sessionId}/join`)).data,

    report: async (sessionId: number) =>
        (await api.get<FaceCheckReport>(`/zoom-sessions/${sessionId}/report`)).data,

    /**
     * Muammoli kadrni yangi oynada ochadi. Surat himoyalangan: oddiy havola
     * tokensiz ochilardi va 401 qaytarardi, shuning uchun avval `api` orqali
     * yuklab olinadi.
     */
    openImage: async (checkId: number) => {
        const response = await api.get<Blob>(`/zoom-sessions/face-check/${checkId}/image`, { responseType: 'blob' });
        const url = URL.createObjectURL(response.data);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
};
