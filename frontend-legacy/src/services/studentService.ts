import api from './api';

export interface Student {
    id: number;
    user_id: number;
    first_name: string;
    last_name: string;
    third_name: string;
    full_name: string;
    group_id: number;
    student_id_number: string | null;
    image_path: string | null;
    birth_date: string | null;
    phone: string | null;
    gender: string | null;
    university: string | null;
    specialty: string | null;
    student_status: string | null;
    education_form: string | null;
    education_type: string | null;
    payment_form: string | null;
    education_lang: string | null;
    faculty: string | null;
    level: string | null;
    semester: string | null;
    address: string | null;
    avg_gpa: number | null;
    created_at: string;
    updated_at: string;
}

export interface StudentCreateRequest {
    first_name: string;
    last_name: string;
    third_name: string;
    group_id: number;
    user_id: number; // Links to a user in the auth system
}

export interface StudentListResponse {
    total: number;
    page: number;
    limit: number;
    students: Student[];
}

export const studentService = {
    getStudents: async (page = 1, limit = 10, full_name?: string, user_id?: number, group_id?: number) => {
        const response = await api.get<StudentListResponse>('/students/', {
            params: { page, limit, search: full_name, user_id, group_id },
        });
        return response.data;
    },



    createStudent: async (data: StudentCreateRequest): Promise<Student> => {
        const response = await api.post<Student>('/students/', data);
        return response.data;
    },

    getStudentById: async (id: number): Promise<Student> => {
        const response = await api.get<Student>(`/students/${id}`);
        return response.data;
    },

    updateStudent: async (id: number, data: Partial<StudentCreateRequest>): Promise<Student> => {
        const response = await api.put<Student>(`/students/${id}`, data);
        return response.data;
    },
    
    updateStudentGroup: async (id: number, group_id: number): Promise<Student> => {
        const response = await api.put<Student>(`/students/${id}`, { group_id });
        return response.data;
    },

    deleteStudent: async (id: number, force?: boolean): Promise<void> => {
        const url = force ? `/students/${id}?force=true` : `/students/${id}`;
        await api.delete(url);
    },
};
