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

export interface StudentListParams {
    sort_by?: 'name' | 'user_id' | 'created_at';
    order?: 'asc' | 'desc';
}

// ── Talaba dashboardi (`GET /students/me/dashboard`) ───────────────────────

export interface StudentDashboardProfile {
    group_id: number | null;
    group_name: string | null;
    level: string | null;
    semester: string | null;
    specialty: string | null;
    faculty: string | null;
    avg_gpa: number | null;
}

export interface StudentDashboardTotals {
    courses: number;
    upcoming_lessons: number;
    homeworks_pending: number;
    homeworks_submitted: number;
    homeworks_graded: number;
    homeworks_missed: number;
    quizzes_taken: number;
}

export interface StudentDashboardAttendanceCourse {
    course_id: number;
    course_name: string;
    percent: number | null;
    absent: number;
}

export interface StudentDashboardAttendance {
    present: number;
    late: number;
    absent: number;
    excused: number;
    /** `null` — jurnal hali to'ldirilmagan (0% bilan bir xil emas). */
    percent: number | null;
    courses: StudentDashboardAttendanceCourse[];
}

export interface StudentDashboardGrades {
    avg_grade: number | null;
    grade_5: number;
    grade_4: number;
    grade_3: number;
    grade_2: number;
    /** Uy vazifasi baholari `max_grade` ga nisbatan foizda. */
    homework_percent: number | null;
}

export interface StudentDashboardLesson {
    id: number;
    topic: string;
    date: string;
    lesson_type: string | null;
    course_id: number;
    course_name: string;
}

export interface StudentDashboardHomework {
    id: number;
    title: string;
    deadline: string;
    course_id: number;
    course_name: string;
    lesson_id: number | null;
}

export interface StudentDashboardResult {
    id: number;
    quiz_title: string | null;
    subject_name: string | null;
    grade: number | null;
    correct_answers: number | null;
    wrong_answers: number | null;
    finished_at: string | null;
}

export interface StudentDashboard {
    profile: StudentDashboardProfile;
    totals: StudentDashboardTotals;
    attendance: StudentDashboardAttendance;
    grades: StudentDashboardGrades;
    upcoming_lessons: StudentDashboardLesson[];
    homeworks: StudentDashboardHomework[];
    recent_results: StudentDashboardResult[];
}

export const studentService = {
    /** Joriy talabaning bosh sahifa statistikasi — faqat o'zi. */
    getMyDashboard: async (): Promise<StudentDashboard> => {
        const response = await api.get<StudentDashboard>('/students/me/dashboard');
        return response.data;
    },

    getStudents: async (
        page = 1,
        limit = 10,
        full_name?: string,
        user_id?: number,
        group_id?: number,
        params?: StudentListParams,
    ) => {
        const response = await api.get<StudentListResponse>('/students/', {
            params: {
                page,
                limit,
                search: full_name,
                user_id,
                group_id,
                sort_by: params?.sort_by,
                order: params?.sort_by ? (params.order ?? 'asc') : undefined,
            },
        });
        return response.data;
    },



    // EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
    // olindi — backendda ham bu endpointlar kommentda.
    // createStudent: async (data: StudentCreateRequest): Promise<Student> => {
    //     const response = await api.post<Student>('/students/', data);
    //     return response.data;
    // },

    getStudentById: async (id: number): Promise<Student> => {
        const response = await api.get<Student>(`/students/${id}`);
        return response.data;
    },

    // EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
    // olindi — backendda ham bu endpointlar kommentda.
    // updateStudent: async (id: number, data: Partial<StudentCreateRequest>): Promise<Student> => {
    //     const response = await api.put<Student>(`/students/${id}`, data);
    //     return response.data;
    // },
    //
    // updateStudentGroup: async (id: number, group_id: number): Promise<Student> => {
    //     const response = await api.put<Student>(`/students/${id}`, { group_id });
    //     return response.data;
    // },
    //
    // deleteStudent: async (id: number, force?: boolean): Promise<void> => {
    //     const url = force ? `/students/${id}?force=true` : `/students/${id}`;
    //     await api.delete(url);
    // },
};
