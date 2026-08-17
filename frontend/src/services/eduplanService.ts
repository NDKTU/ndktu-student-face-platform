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
    detail?: string;
    active_academic_year?: { id: number; name: string } | null;
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
    apply: async (payload: {
        run_id: string;
        decisions: Decision[];
        apply_deactivations: boolean;
    }) => {
        const response = await api.post<ApplyResponse>('/integration/eduplan/apply', payload);
        return response.data;
    },
    syncWorkloads: async (academicYearId?: number) => {
        const response = await api.post<WorkloadSyncResult>(
            '/integration/eduplan/workloads',
            null,
            { params: academicYearId ? { academic_year_id: academicYearId } : undefined },
        );
        return response.data;
    },
};
