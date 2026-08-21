import api from './api';

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
    /** Полный прогон: справочники + нагрузка, одним запросом. */
    run: async () => {
        const response = await api.post<RunResponse>('/integration/eduplan/run');
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
    apply: async (payload: {
        run_id: string;
        decisions: Decision[];
        apply_deactivations: boolean;
    }) => {
        const response = await api.post<ApplyResponse>('/integration/eduplan/apply', payload);
        return response.data;
    },
};
