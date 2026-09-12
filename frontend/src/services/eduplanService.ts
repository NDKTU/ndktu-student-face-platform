import api from './api';
import type { CourseType } from './courseTypes';

/** Сущности, которые зеркалятся из EPMOS. Значения совпадают с бэкендом. */
export type EduPlanEntity =
    | 'faculty'
    | 'kafedra'
    | 'speciality'
    | 'group'
    | 'subject'
    | 'teacher'
    | 'curriculum';

/**
 * Boʻlimlar sinxronlash tartibida: bola ota-onadan keyin.
 *
 * Backend'dagi `SYNC_ORDER` bilan bir xil. Interfeys tugmalarni shu
 * tartibda chizadi — admin bogʻliqlik yoʻnalishini koʻrib turadi.
 */
export const SYNC_ENTITIES: EduPlanEntity[] = [
    'faculty',
    'kafedra',
    'speciality',
    'group',
    'subject',
    'teacher',
    'curriculum',
];

/** Har bir boʻlim nimaga tayanadi. Backend'dagi `ENTITY_DEPENDENCIES` nusxasi. */
export const ENTITY_DEPENDENCIES: Record<EduPlanEntity, EduPlanEntity[]> = {
    faculty: [],
    kafedra: ['faculty'],
    speciality: ['kafedra'],
    group: ['speciality'],
    subject: ['kafedra'],
    teacher: ['kafedra'],
    curriculum: ['speciality'],
};

export const ENTITY_LABEL: Record<EduPlanEntity, string> = {
    faculty: 'Fakultetlar',
    kafedra: 'Kafedralar',
    speciality: 'Mutaxassisliklar',
    group: 'Guruhlar',
    subject: 'Fanlar',
    teacher: "O'qituvchilar",
    curriculum: "O'quv rejalar",
};

/** Bitta boʻlim sinxronlangandan keyingi natija. */
export interface EntitySyncResponse {
    entity: EduPlanEntity;
    run_id: string;
    finished_at: string;
    /** Shu prognda EPMOS'dan nechta satr kelgani. */
    total_external: number;
    created: number;
    linked: number;
    updated: number;
    deactivated: number;
    skipped: number;
    /** Koʻp maʼnoli mosliklar — avtomatik qoʻllanmaydi, admin hal qiladi. */
    requires_decision: number;
    errors: string[];
}

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
    /** Shu koʻrib chiqishga kirgan boʻlimlar. Qoʻllash aynan shularga tegadi. */
    entities: EduPlanEntity[];
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
    entities: EduPlanEntity[];
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
    /**
     * EPMOS'ning o'zida o'qituvchi hali biriktirilmagan qatorlar.
     * Bizning bog'lanish muammosi emas — shunchaki hali tayinlanmagan yuklama.
     */
    workloads_without_teacher: number;
    /** O'qituvchi EPMOS'da bor, bizda bog'lanmagan — sinxronlash kerak. */
    unresolved_teacher: number;
    unresolved_subject: number;
    unresolved_group: number;
    stream_expanded: number;
    assignments_resolved: number;
    created: number;
    updated: number;
    deactivated: number;
    /** `true` — bu faqat koʻrsatuv edi, baza oʻzgarmadi. */
    dry_run?: boolean;
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

/**
 * Sinxronlash so'rovlari uchun timeout.
 *
 * `api` ning umumiy chegarasi 10 soniya — oddiy so'rov uchun to'g'ri, lekin
 * bu yerda bitta chaqiruv ichida EPMOS'dan o'nlab sahifa o'qiladi va minglab
 * qator yoziladi: yuklama 27 000 qatorda ~15 soniya oladi. 10 soniyada uzilsa
 * ish to'xtamaydi — backend davom etadi, admin esa «timeout of 10000ms
 * exceeded» ko'radi va nima bo'lganini bilmaydi.
 *
 * Nginx bu yo'llarga 900 soniya beradi (frontend/nginx.conf), shuning uchun
 * chegarani o'shanga moslashtiramiz: uzilish sababi tarmoq bo'lsin, sun'iy
 * chegara emas.
 */
const SYNC_TIMEOUT_MS = 900_000;

/** Ключ предложения — он же идентификатор решения администратора. */
export const proposalKey = (p: Proposal) => `${p.entity}:${p.external_id}`;

export const eduplanService = {
    getStatus: async () => {
        const response = await api.get<EduPlanStatus>('/integration/eduplan/status');
        return response.data;
    },
    preview: async (entities?: EduPlanEntity[]) => {
        const response = await api.post<PreviewResponse>(
            '/integration/eduplan/preview',
            null,
            {
                timeout: SYNC_TIMEOUT_MS,
                ...(entities?.length
                    ? { params: { entities }, paramsSerializer: { indexes: null } }
                    : {}),
            },
        );
        return response.data;
    },
    /** Bitta boʻlim boʻyicha koʻrib chiqish: nima oʻzgarishini koʻrsatadi, yozmaydi. */
    previewEntity: async (entity: EduPlanEntity) => {
        const response = await api.post<PreviewResponse>(
            `/integration/eduplan/preview/${entity}`,
            null,
            { timeout: SYNC_TIMEOUT_MS },
        );
        return response.data;
    },
    /**
     * Bitta boʻlimni sinxronlaydi: koʻrib chiqadi va bir maʼnolisini qoʻllaydi.
     *
     * Boshqa boʻlimlar qayta sinxronlanmaydi — EPMOS'dan faqat shu boʻlim
     * oʻqiladi. Koʻp maʼnoli mosliklar qoʻllanmaydi, `requires_decision` da
     * sanog\`i qaytadi.
     */
    syncEntity: async (entity: EduPlanEntity, applyDeactivations = false) => {
        const response = await api.post<EntitySyncResponse>(
            `/integration/eduplan/sync/${entity}`,
            null,
            {
                timeout: SYNC_TIMEOUT_MS,
                ...(applyDeactivations ? { params: { apply_deactivations: true } } : {}),
            },
        );
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
    /**
     * Yuklamani koʻrib chiqish: xuddi shu hisob, lekin bazaga yozilmaydi.
     * Backend prognni oxirigacha bajaradi va tranzaksiyani qaytaradi, shuning
     * uchun «qoʻshiladi/yangilanadi» sonlari haqiqiy.
     */
    previewWorkloads: async (academicYearId?: number) => {
        const response = await api.post<WorkloadSyncResult>(
            '/integration/eduplan/workloads/preview',
            null,
            {
                timeout: SYNC_TIMEOUT_MS,
                ...(academicYearId ? { params: { academic_year_id: academicYearId } } : {}),
            },
        );
        return response.data;
    },
    /** Yuklamalarni sinxronlash: o'qituvchi-fan-guruh biriktirmalari. */
    syncWorkloads: async (academicYearId?: number) => {
        const response = await api.post<WorkloadSyncResult>(
            '/integration/eduplan/workloads',
            null,
            {
                timeout: SYNC_TIMEOUT_MS,
                ...(academicYearId ? { params: { academic_year_id: academicYearId } } : {}),
            },
        );
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
            { timeout: SYNC_TIMEOUT_MS },
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
            { timeout: SYNC_TIMEOUT_MS, params: archive ? { archive: true } : undefined },
        );
        return response.data;
    },
    apply: async (payload: {
        run_id: string;
        decisions: Decision[];
        apply_deactivations: boolean;
    }) => {
        const response = await api.post<ApplyResponse>(
            '/integration/eduplan/apply',
            payload,
            { timeout: SYNC_TIMEOUT_MS },
        );
        return response.data;
    },
};
