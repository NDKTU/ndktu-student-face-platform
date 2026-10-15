import api from './api';

/**
 * HEMIS dars jadvali zerkalosi (`/api/hemis/schedule*`).
 *
 * Jadval bizning tashkiliy tuzilmadan ajratilgan: hamma narsa HEMIS
 * identifikatorlari bilan saqlanadi va shular bo'yicha qidiriladi.
 * O'qituvchi o'z jadvalini logini (`employee_id_number`) bo'yicha, talaba —
 * logini orqali HEMIS guruhi bo'yicha topadi.
 */
export interface ScheduleLesson {
    hemis_id: number;
    education_year: string;
    education_year_name: string;
    semester_code: string;
    semester_name: string;
    group_hemis_id: number | null;
    group_name: string;
    education_lang: string;
    subject_hemis_id: number | null;
    subject_code: string;
    subject_name: string;
    faculty_hemis_id: number | null;
    faculty_name: string;
    department_hemis_id: number | null;
    department_name: string;
    auditorium_code: number | null;
    auditorium_name: string;
    auditorium_type: string;
    building_name: string;
    training_type_code: string;
    training_type: string;
    lesson_pair: string;
    /** "14:10:00" */
    start_time: string | null;
    end_time: string | null;
    employee_hemis_id: number | null;
    employee_id_number: string | null;
    employee_name: string;
    /** "2026-10-29" */
    lesson_date: string;
    is_active: boolean;
}

export interface MySchedule {
    /** `null` — foydalanuvchi o'qituvchi ham, talaba ham emas. */
    as_role: 'teacher' | 'student' | null;
    date_from: string;
    date_to: string;
    items: ScheduleLesson[];
}

/** Kaskad: fakultet va kafedra qolgan ro'yxatlarni toraytiradi. */
export interface ScheduleScope {
    /** Guruhning fakulteti. */
    faculty_hemis_id?: number;
    /** Fanni o'qitadigan kafedra (HEMIS `department`). */
    department_hemis_id?: number;
}

export interface ScheduleListParams extends ScheduleScope {
    group_hemis_id?: number;
    employee_id_number?: string;
    subject_hemis_id?: number;
    education_year?: string;
    date_from?: string;
    date_to?: string;
    include_inactive?: boolean;
    page: number;
    limit: number;
}

export interface ScheduleListResponse {
    items: ScheduleLesson[];
    total: number;
    page: number;
    limit: number;
}

export interface ScheduleFilterOption {
    value: string;
    label: string;
}

export interface ScheduleFilters {
    faculties: ScheduleFilterOption[];
    departments: ScheduleFilterOption[];
    education_years: ScheduleFilterOption[];
    groups: ScheduleFilterOption[];
    employees: ScheduleFilterOption[];
    subjects: ScheduleFilterOption[];
}

export interface ScheduleSyncResult {
    education_years: string[];
    fetched: number;
    saved: number;
    hemis_total: number;
    deactivated: number;
    without_employee_number: number;
    complete: boolean;
    deactivation_skipped: string | null;
}

export const hemisScheduleService = {
    my: async (params: { date_from: string; date_to: string }) => {
        const response = await api.get<MySchedule>('/hemis/schedule/my', { params });
        return response.data;
    },

    list: async (params: ScheduleListParams) => {
        const response = await api.get<ScheduleListResponse>('/hemis/schedule', { params });
        return response.data;
    },

    filters: async (params: ScheduleScope) => {
        const response = await api.get<ScheduleFilters>('/hemis/schedule/filters', { params });
        return response.data;
    },

    // Joriy yil ~191 sahifa, ~4,5 daqiqa: umumiy 60 s lik timeout uni uzib
    // qo'yardi. nginx'da `/api/hemis/` uchun 900 s.
    sync: async (data: { allow_bulk_deactivate?: boolean }) => {
        const response = await api.post<ScheduleSyncResult>('/hemis/schedule/sync', data, {
            timeout: 900_000,
        });
        return response.data;
    },
};
