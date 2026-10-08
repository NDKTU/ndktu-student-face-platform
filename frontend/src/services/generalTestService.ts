import api from './api';
import { keepaliveLeave, type LeaveReason } from './quizProcessService';

/**
 * Elementar test (ilgari «Umumiy test») — admin ochgan fanga tegishli oddiy
 * test. Savollar fanning bankida turadi: fan testlari undan tasodifiy oladi.
 * Natijalar oddiy test natijalaridan alohida saqlanadi
 * (`backend/app/modules/general_test`).
 *
 * Faol testni ikki xil odam ko'radi: fanga biriktirilgan foydalanuvchilar
 * (o'qituvchi bo'lishi shart emas — talaba ham, xodim ham) va testga
 * biriktirilgan guruhlarning talabalari.
 */

export type OptionLetter = 'a' | 'b' | 'c' | 'd';

export interface SubjectRef {
    id: number;
    name: string;
}

export interface GeneralTestSubject extends SubjectRef {
    description: string | null;
    user_count: number;
    test_count: number;
    /** Fan savollar bankidagi savollar. */
    question_count: number;
    created_at: string;
    /** Ega yoki admin. `false` — fanga biriktirilgan: faqat savol qo'shadi. */
    can_manage: boolean;
}

export interface SubjectListResponse {
    total: number;
    page: number;
    limit: number;
    subjects: GeneralTestSubject[];
}

export interface SubjectPayload {
    name: string;
    description: string | null;
}

export type UserKindFilter = 'student' | 'teacher' | 'other';

export interface UserFilter {
    search?: string;
    kind?: UserKindFilter;
    role_id?: number;
    faculty_id?: number;
    group_id?: number;
    course?: number;
}

export interface SubjectUser {
    user_id: number;
    full_name: string;
    username: string | null;
    user_kind: 'student' | 'teacher' | 'boshqa';
    group_name: string | null;
    assigned: boolean;
}

export interface SubjectUserListResponse {
    total: number;
    page: number;
    limit: number;
    users: SubjectUser[];
}

export interface FilterOption {
    id: number;
    name: string;
}

export interface GroupOption {
    id: number;
    name: string;
    faculty_name: string | null;
    course: number | null;
    student_count: number;
}

export interface GroupOptionFilter {
    search?: string;
    faculty_id?: number;
    course?: number;
    limit?: number;
}

export interface GeneralTestSummary {
    id: number;
    subject: SubjectRef;
    title: string;
    duration: number;
    attempt_limit: number;
    /** Bitta urinishda beriladigan savollar; `null` — hammasi. */
    question_number: number | null;
    is_active: boolean;
    /** Qat'iy rejim: sahifadan chiqsa urinish yopiladi. */
    strict_mode?: boolean;
    /** Matnni yashirish: savol faqat bosib turilganda ko'rinadi. */
    hold_to_reveal?: boolean;
    /** Boshlash PIN'i; `null` — test PIN'siz. Faqat test egasi/admin ko'radi. */
    pin: string | null;
    /** Testdagi barcha savollar. */
    question_count: number;
    attempt_count: number;
    group_count: number;
    created_at: string;
}

export interface GeneralTestQuestion {
    id: number;
    subject_id: number;
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: OptionLetter;
    order: number;
}

/** Testga biriktirilgan guruh. `is_active: false` — guruh uchun yashirilgan. */
export interface TestGroup extends GroupOption {
    is_active: boolean;
}

export interface GeneralTestDetail extends GeneralTestSummary {
    groups: TestGroup[];
}

export interface GeneralTestListResponse {
    total: number;
    page: number;
    limit: number;
    tests: GeneralTestSummary[];
}

/** Nom yo'q: u fan va guruhlardan avtomatik tuziladi. */
export interface GeneralTestPayload {
    subject_id: number;
    /** Faqat yaratishda — darhol biriktiriladigan guruhlar. */
    group_ids?: number[];
    duration: number;
    attempt_limit: number;
    question_number: number | null;
    is_active: boolean;
    /** PIN bilan boshlansinmi — PIN'ni server yaratadi. */
    pin_required?: boolean;
    /** Faqat tahrirlashda: yangi PIN yaratish. */
    regenerate_pin?: boolean;
    strict_mode?: boolean;
    hold_to_reveal?: boolean;
}

export interface QuestionPayload {
    text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: OptionLetter;
}

export interface UploadResponse {
    created: number;
    warnings: string[];
}

export interface AvailableTest {
    id: number;
    subject_name: string;
    title: string;
    duration: number;
    attempt_limit: number;
    question_count: number;
    attempts_used: number;
    in_progress_attempt_id: number | null;
    best_score: number | null;
    /** Yangi urinish PIN so'raydi (PIN'ning o'zi kelmaydi). */
    pin_required: boolean;
    strict_mode?: boolean;
}

export interface TakeQuestion {
    id: number;
    text: string;
    options: { key: OptionLetter; text: string }[];
    selected: OptionLetter | null;
}

export interface AttemptState {
    attempt_id: number;
    test_id: number;
    title: string;
    remaining_seconds: number;
    questions: TakeQuestion[];
    strict_mode?: boolean;
    hold_to_reveal?: boolean;
}

export interface AttemptResult {
    attempt_id: number;
    test_id: number;
    title: string;
    total_questions: number;
    correct_answers: number;
    score: number;
    started_at: string;
    finished_at: string | null;
    /** Qat'iy testda yopilish sababi; bo'sh — oddiy yakun. */
    stop_reason?: string | null;
}

export interface ResultRow {
    attempt_id: number;
    test_id: number;
    test_title: string;
    subject_name: string;
    user_id: number | null;
    full_name: string;
    username: string | null;
    group_name: string | null;
    user_kind: 'student' | 'teacher' | 'boshqa';
    total_questions: number;
    correct_answers: number;
    score: number;
    started_at: string;
    finished_at: string | null;
    /** Qat'iy testda yopilish sababi; bo'sh — oddiy yakun. */
    stop_reason?: string | null;
}

export interface ResultListResponse {
    total: number;
    page: number;
    limit: number;
    results: ResultRow[];
}

export interface ResultFilter {
    subject_id?: number;
    test_id?: number;
    search?: string;
    page?: number;
    limit?: number;
}

function saveXlsx(data: BlobPart, name: string) {
    const url = window.URL.createObjectURL(
        new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export const generalTestService = {
    // ── Fanlar ───────────────────────────────────────────────────────────
    subjects: async (page = 1, limit = 20, search?: string) =>
        (await api.get<SubjectListResponse>('/general-test/subject', { params: { page, limit, search: search || undefined } }))
            .data,
    subject: async (id: number) => (await api.get<GeneralTestSubject>(`/general-test/subject/${id}`)).data,
    createSubject: async (data: SubjectPayload) =>
        (await api.post<GeneralTestSubject>('/general-test/subject', data)).data,
    updateSubject: async (id: number, data: SubjectPayload) =>
        (await api.put<GeneralTestSubject>(`/general-test/subject/${id}`, data)).data,
    removeSubject: async (id: number) => {
        await api.delete(`/general-test/subject/${id}`);
    },
    subjectUsers: async (id: number, filter: UserFilter & { page: number; limit: number }) =>
        (await api.get<SubjectUserListResponse>(`/general-test/subject/${id}/users`, { params: filter })).data,
    subjectCandidates: async (id: number, filter: UserFilter & { page: number; limit: number }) =>
        (await api.get<SubjectUserListResponse>(`/general-test/subject/${id}/candidates`, { params: filter })).data,
    /** `user_ids` — tanlanganlar, `filter` — filtrga mos hammasi. */
    addSubjectUsers: async (id: number, body: { user_ids?: number[]; filter?: UserFilter }) =>
        (await api.post<{ added: number }>(`/general-test/subject/${id}/users`, body)).data,
    removeSubjectUser: async (id: number, userId: number) => {
        await api.delete(`/general-test/subject/${id}/users/${userId}`);
    },
    filterOptions: async () =>
        (await api.get<{ roles: FilterOption[]; faculties: FilterOption[] }>('/general-test/subject/filter-options')).data,

    // ── Guruhlar ─────────────────────────────────────────────────────────
    groupOptions: async (filter: GroupOptionFilter) =>
        (await api.get<{ groups: GroupOption[] }>('/general-test/group-options', { params: filter })).data.groups,
    addGroups: async (testId: number, groupIds: number[]) =>
        (await api.post<GeneralTestDetail>(`/general-test/${testId}/groups`, { group_ids: groupIds })).data,
    setGroupActive: async (testId: number, groupId: number, isActive: boolean) =>
        (await api.patch<GeneralTestDetail>(`/general-test/${testId}/groups/${groupId}`, { is_active: isActive })).data,
    removeGroup: async (testId: number, groupId: number) =>
        (await api.delete<GeneralTestDetail>(`/general-test/${testId}/groups/${groupId}`)).data,

    // ── Boshqaruv ────────────────────────────────────────────────────────
    list: async (page = 1, limit = 20, search?: string, subjectId?: number) =>
        (
            await api.get<GeneralTestListResponse>('/general-test/', {
                params: { page, limit, search: search || undefined, subject_id: subjectId || undefined },
            })
        ).data,
    get: async (id: number) => (await api.get<GeneralTestDetail>(`/general-test/${id}`)).data,
    create: async (data: GeneralTestPayload) => (await api.post<GeneralTestDetail>('/general-test/', data)).data,
    update: async (id: number, data: Partial<GeneralTestPayload>) =>
        (await api.put<GeneralTestDetail>(`/general-test/${id}`, data)).data,
    remove: async (id: number) => {
        await api.delete(`/general-test/${id}`);
    },

    // ── Fan savollar banki ───────────────────────────────────────────────
    subjectQuestions: async (subjectId: number) =>
        (await api.get<{ questions: GeneralTestQuestion[] }>(`/general-test/subject/${subjectId}/questions`)).data
            .questions,
    createQuestion: async (subjectId: number, data: QuestionPayload) =>
        (await api.post<GeneralTestQuestion>(`/general-test/subject/${subjectId}/question`, data)).data,
    updateQuestion: async (id: number, data: QuestionPayload) =>
        (await api.put<GeneralTestQuestion>(`/general-test/question/${id}`, data)).data,
    removeQuestion: async (id: number) => {
        await api.delete(`/general-test/question/${id}`);
    },
    uploadExcel: async (subjectId: number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return (await api.post<UploadResponse>(`/general-test/subject/${subjectId}/upload_excel`, formData)).data;
    },
    downloadTemplate: async () => {
        const response = await api.get('/general-test/excel_template', { responseType: 'blob' });
        saveXlsx(response.data, 'savollar-shablon.xlsx');
    },

    // ── Natijalar ────────────────────────────────────────────────────────
    results: async (filter: ResultFilter) =>
        (await api.get<ResultListResponse>('/general-test/results', { params: filter })).data,
    exportResults: async (filter: ResultFilter) => {
        const response = await api.get('/general-test/results/export', {
            params: { subject_id: filter.subject_id, test_id: filter.test_id, search: filter.search },
            responseType: 'blob',
        });
        saveXlsx(response.data, 'elementar-test-natijalari.xlsx');
    },
    removeResult: async (attemptId: number) => {
        await api.delete(`/general-test/results/${attemptId}`);
    },

    // ── Ishlash ──────────────────────────────────────────────────────────
    available: async () => (await api.get<{ tests: AvailableTest[] }>('/general-test/available')).data.tests,
    myResults: async () => (await api.get<{ results: AttemptResult[] }>('/general-test/my-results')).data.results,
    start: async (testId: number, pin?: string) =>
        (await api.post<AttemptState>(`/general-test/${testId}/start`, pin ? { pin } : undefined)).data,
    getAttempt: async (attemptId: number) => (await api.get<AttemptState>(`/general-test/attempt/${attemptId}`)).data,
    answer: async (attemptId: number, questionId: number, option: OptionLetter) => {
        await api.post(`/general-test/attempt/${attemptId}/answer`, { question_id: questionId, option });
    },
    finish: async (attemptId: number) =>
        (await api.post<AttemptResult>(`/general-test/attempt/${attemptId}/finish`)).data,
    /** Qat'iy test: sahifa hali ochiq. */
    heartbeat: async (attemptId: number) => {
        await api.post(`/general-test/attempt/${attemptId}/heartbeat`);
    },
    /** Qat'iy test: sahifadan chiqildi. `keepalive` — sabab `quizProcessService.sendLeave` da. */
    sendLeave: (attemptId: number, reason: LeaveReason) =>
        keepaliveLeave<AttemptResult>(`/general-test/attempt/${attemptId}/leave`, { reason }),
};
