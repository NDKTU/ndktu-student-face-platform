import api from './api';
import type { CourseType } from './courseTypes';

/** Сущности, которые зеркалятся из EduPlan. Значения совпадают с бэкендом. */
export type EduPlanEntity =
    | 'faculty'
    | 'kafedra'
    | 'department'
    | 'speciality'
    | 'group'
    | 'subject'
    | 'employee';

export type ProposalAction =
    | 'create'
    | 'link'
    | 'update'
    | 'unchanged'
    | 'conflict'
    | 'deactivate';

export interface Candidate {
    id: number;
    name: string;
    hint?: string | null;
}

export interface Proposal {
    entity: EduPlanEntity;
    action: ProposalAction;
    external_id: string;
    external_name: string;
    local_id?: number | null;
    candidates: Candidate[];
    changes: Record<string, unknown>;
    note?: string | null;
}

export interface EntitySummary {
    entity: EduPlanEntity;
    total_external: number;
    create: number;
    link: number;
    update: number;
    unchanged: number;
    conflict: number;
    deactivate: number;
}

export interface PreviewResponse {
    run_id: string;
    generated_at: string;
    summary: EntitySummary[];
    proposals: Proposal[];
    requires_decision: number;
}

export interface Decision {
    key: string;
    action: ProposalAction;
    local_id?: number | null;
}

export interface ApplyResult {
    entity: EduPlanEntity;
    created: number;
    linked: number;
    updated: number;
    deactivated: number;
    skipped: number;
    errors: string[];
}

export interface ApplyResponse {
    run_id: string;
    results: ApplyResult[];
    finished_at: string;
}

export interface EduPlanStatus {
    configured: boolean;
    reachable: boolean;
    base_url: string;
    /** 'db' — учётные данные введены в интерфейсе, 'env' — из переменных окружения */
    source?: 'db' | 'env';
    detail?: string;
    active_academic_year?: { id: number; name: string } | null;
}

/** Настройки подключения, как их показывает API: пароль наружу не отдаётся. */
export interface EduPlanSettings {
    source: 'db' | 'env';
    base_url: string;
    username: string;
    active_role: string;
    has_password: boolean;
    enabled: boolean;
    updated_at?: string | null;
}

export interface EduPlanSettingsPayload {
    base_url?: string | null;
    username: string;
    /** Пустое значение = оставить прежний пароль */
    password?: string | null;
    active_role: string;
}

export interface WorkloadSyncResult {
    academic_year_id: number;
    workloads_total: number;
    workloads_inactive_skipped: number;
    unresolved_teacher: number;
    unresolved_subject: number;
    unresolved_group: number;
    stream_expanded: number;
    assignments_resolved: number;
    created: number;
    updated: number;
    deactivated: number;
}

/**
 * Итог полного прогона (`POST /run`). Он применяет только однозначные предложения;
 * конфликты не применяются, их количество приходит в `requires_decision`.
 * Сами конфликты в ответе не передаются: чтобы их разобрать, страница запрашивает
 * свежий предпросмотр — повторно применять тот же `run_id` нельзя, предложения
 * в нём заморожены и создали бы дубли уже созданных строк.
 */
export interface RunResponse {
    triggered_by: string;
    run_id: string;
    requires_decision: number;
    directories: ApplyResult[];
    workloads: WorkloadSyncResult | null;
    workloads_error: string | null;
}

/**
 * Fon prognining holati.
 *
 * Progn bir necha daqiqa davom etadi va HTTP soʻrovda kutib boʻlmaydi:
 * axios 10 soniyada, nginx 60 soniyada uzadi. Shuning uchun `/run` darhol
 * shu holatni qaytaradi, interfeys esa `/run/status` ni soʻrab turadi.
 */
export interface RunState {
    status: 'running' | 'done' | 'failed';
    triggered_by: string;
    started_at: string;
    finished_at: string | null;
    summary: RunResponse | null;
    error: string | null;
}

/**
 * Yuklamadan yigʻilgan kurs taklifi.
 *
 * Kurs — «fan + semestr + oʻqituvchi + mashgʻulot turi» toʻrtligi. Har bir
 * turning oʻz kursi va oʻz egasi bor.
 */
export interface CoursePlan {
    external_id: string;
    /** Shu kalitli faol kurs allaqachon bor — qayta yaratilmaydi. */
    exists: boolean;
    /** Kurs arxivda va yuklamada yana paydo boʻldi — qaytariladi. */
    archived: boolean;
    subject_id: number;
    subject_name: string;
    teacher_user_id: number;
    teacher_name: string | null;
    /** lecture | practice | lab. Seminar EPOS yuklamasida yoʻq. */
    course_type: CourseType;
    semester_type: string | null;
    /** «Bahorgi, Kuzgi» birlashgan qiymatida semestr raqami boʻlmaydi. */
    semester_number: number | null;
    academic_year_id: number | null;
    group_ids: number[];
    group_names: string[];
}

/** EPOS yuklamasida qolmagan kurs. Oʻchirilmaydi — arxivga oʻtadi. */
export interface CourseArchiveRow {
    course_id: number;
    name: string;
    course_type: CourseType | null;
    teacher_name: string | null;
    group_names: string[];
    /** Darslari bor kursni arxivlash jurnalni ham koʻzdan yashiradi. */
    lesson_count: number;
}

export interface CoursePreviewResponse {
    plans: CoursePlan[];
    archive: CourseArchiveRow[];
    /** `apply` dan keyin haqiqatda oʻzgargan kurslar soni. */
    created: number;
    restored: number;
    archived: number;
    /** Arxivlash chegaradan oshdi — sabab odatda toʻliq yuklanmagan yuklama. */
    archive_blocked: boolean;
    summary: {
        total: number;
        existing: number;
        to_create: number;
        to_restore: number;
        to_archive: number;
    };
    /** Turlar kesimi: `{ lecture: 128, practice: 88, lab: 29 }`. */
    by_type: Record<string, number>;
}

/** Ключ предложения — он же идентификатор решения администратора. */
export const proposalKey = (p: Proposal) => `${p.entity}:${p.external_id}`;

export const eduplanService = {
    getStatus: async () => {
        const response = await api.get<EduPlanStatus>('/integration/eduplan/status');
        return response.data;
    },
    preview: async () => {
        const response = await api.post<PreviewResponse>('/integration/eduplan/preview');
        return response.data;
    },
    /** Prognni fonda boshlaydi va darhol qaytadi. Natija — `runState` orqali. */
    run: async () => {
        const response = await api.post<RunState>('/integration/eduplan/run');
        return response.data;
    },
    /** Oxirgi prognning holati. `null` — hali progn boʻlmagan. */
    runState: async () => {
        const response = await api.get<RunState | null>('/integration/eduplan/run/status');
        return response.data;
    },
    getSettings: async () => {
        const response = await api.get<EduPlanSettings>('/integration/eduplan/settings');
        return response.data;
    },
    updateSettings: async (payload: EduPlanSettingsPayload) => {
        const response = await api.put<EduPlanSettings>('/integration/eduplan/settings', payload);
        return response.data;
    },
    clearSettings: async () => {
        await api.delete('/integration/eduplan/settings');
    },
    /** Yuklamadan qanday kurslar chiqishini koʻrsatadi, hech nima yozmaydi. */
    previewCourses: async () => {
        const response = await api.get<CoursePreviewResponse>(
            '/integration/eduplan/courses/preview',
        );
        return response.data;
    },
    /**
     * Yoʻq kurslarni yaratadi va arxivdan qaytganlarini tiklaydi.
     *
     * `archive` — yuklamada qolmagan kurslarni arxivga oʻtkazish. Alohida
     * tasdiq, chunki kurs bilan birga uning jurnali ham koʻzdan yoʻqoladi.
     */
    applyCourses: async (archive = false) => {
        const response = await api.post<CoursePreviewResponse>(
            '/integration/eduplan/courses/apply',
            null,
            { params: archive ? { archive: true } : undefined },
        );
        return response.data;
    },
    apply: async (payload: {
        run_id: string;
        decisions: Decision[];
        apply_deactivations: boolean;
    }) => {
        const response = await api.post<ApplyResponse>('/integration/eduplan/apply', payload);
        return response.data;
    },
};
