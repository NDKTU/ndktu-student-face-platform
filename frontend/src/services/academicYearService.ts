import api from './api';

export interface Semester {
    id: number;
    academic_year_id: number;
    number: number;
    start_date: string;
    end_date: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AcademicYear {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    semesters: Semester[];
    created_at: string;
    updated_at: string;
}

export interface AcademicYearListResponse {
    total: number;
    page: number;
    limit: number;
    years: AcademicYear[];
}

export interface SemesterCreateRequest {
    number: 1 | 2;
    start_date: string;
    end_date: string;
}

export interface AcademicYearCreateRequest {
    name: string;
    start_date: string;
    end_date: string;
    is_active?: boolean;
    semesters?: SemesterCreateRequest[];
}

export interface AcademicYearUpdateRequest {
    name?: string;
    start_date?: string;
    end_date?: string;
    is_active?: boolean;
}

export interface SemesterUpdateRequest {
    start_date?: string;
    end_date?: string;
    is_active?: boolean;
}

export const academicYearService = {
    list: async (params?: { is_active?: boolean; page?: number; limit?: number }) => {
        const response = await api.get<AcademicYearListResponse>('/academic-year/', { params });
        return response.data;
    },
    getById: async (id: number) => {
        const response = await api.get<AcademicYear>(`/academic-year/${id}`);
        return response.data;
    },
    create: async (data: AcademicYearCreateRequest) => {
        const response = await api.post<AcademicYear>('/academic-year/', data);
        return response.data;
    },
    update: async (id: number, data: AcademicYearUpdateRequest) => {
        const response = await api.put<AcademicYear>(`/academic-year/${id}`, data);
        return response.data;
    },
    delete: async (id: number) => {
        await api.delete(`/academic-year/${id}`);
    },
    updateSemester: async (semesterId: number, data: SemesterUpdateRequest) => {
        const response = await api.put<Semester>(`/academic-year/semester/${semesterId}`, data);
        return response.data;
    },
};
