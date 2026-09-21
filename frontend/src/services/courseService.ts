import api from './api';
import type { CourseType } from './courseTypes';
import type { GradebookHomework, GradebookHomeworkCell, GradebookQuiz, GradebookQuizCell } from './lessonService';

export interface CourseSubjectInfo {
    id: number;
    name: string;
}

export interface CourseTeacherInfo {
    id: number;
    username: string;
    full_name: string;
}

export interface CourseFacultyInfo {
    id: number;
    name: string;
}

export interface CourseKafedraInfo {
    id: number;
    name: string;
}

export interface CourseSpecialityInfo {
    id: number;
    name: string;
}

export interface CourseGroupInfo {
    id: number;
    name: string;
}

export interface Course {
    id: number;
    name: string;
    description?: string | null;
    subject_id: number;
    teacher_id: number;
    course_type?: CourseType | null;
    semester_number?: number | null;
    /** `false` — kurs arxivda: EPOS yuklamasida endi yo'q. */
    is_active: boolean;
    faculty_id?: number | null;
    kafedra_id?: number | null;
    speciality_id?: number | null;
    subject?: CourseSubjectInfo;
    teacher?: CourseTeacherInfo;
    faculty?: CourseFacultyInfo;
    kafedra?: CourseKafedraInfo;
    speciality?: CourseSpecialityInfo;
    groups: CourseGroupInfo[];
    lesson_count: number;
    created_at: string;
    updated_at: string;
}

export interface CourseCreateRequest {
    /** Bo'sh qoldirilsa server fan, guruhlar, tur va semestrdan yig'adi. */
    name?: string;
    subject_id: number;
    teacher_id: number;
    course_type: CourseType;
    description?: string;
    semester_number?: number;
    group_ids?: number[];
    faculty_id?: number;
    kafedra_id?: number;
    speciality_id?: number;
}

export type CourseUpdateRequest = Partial<CourseCreateRequest>;

export interface CourseListFilters {
    page?: number;
    limit?: number;
    teacherId?: number;
    subjectId?: number;
    groupId?: number;
    courseType?: CourseType;
    semesterNumber?: number;
    facultyId?: number;
    kafedraId?: number;
    specialityId?: number;
    /** `false` — arxiv. Yuborilmasa faqat faol kurslar. */
    isActive?: boolean;
    /** Fan, o'qituvchi, guruh yoki kurs nomi bo'yicha qidiruv — serverda. */
    search?: string;
    sortBy?: 'subject' | 'teacher' | 'semester' | 'type';
    order?: 'asc' | 'desc';
}

export interface CourseListResponse {
    total: number;
    page: number;
    limit: number;
    courses: Course[];
}

export interface CourseTeacherSummary {
    teacher_id: number;
    username: string;
    full_name?: string | null;
    kafedra_id?: number | null;
    kafedra_name?: string | null;
    course_count: number;
    lesson_count: number;
}

/** Talabaning kursdagi baholari (`GET /course/{id}/my-grades`). */
export interface MyHomeworkGrade {
    id: number;
    title: string;
    max_grade: number;
    deadline: string;
    /** Ish topshirilmagan bo'lsa — null. */
    status?: string | null;
    grade?: number | null;
    submitted_at?: string | null;
    late: boolean;
    /** O'qituvchi izohi — faqat baholangan ishda. */
    feedback?: string | null;
}

export interface MyQuizGrade {
    id: number;
    title: string;
    /** Test ishlanmagan bo'lsa — null. */
    grade?: number | null;
    correct_answers?: number | null;
    wrong_answers?: number | null;
    attempts: number;
}

export interface MyGradesTopic {
    /** Darssiz (kurs darajasidagi) vazifa uchun null. */
    lesson_id?: number | null;
    topic: string;
    date?: string | null;
    homework?: MyHomeworkGrade | null;
    quizzes: MyQuizGrade[];
}

export interface MyCourseGrades {
    course_id: number;
    topics: MyGradesTopic[];
}

/** Kurs baholash jurnali (`GET /course/{id}/gradebook`) — bitta guruh bo'yicha. */
export interface CourseGradebookGroup {
    id: number;
    name: string;
    student_count: number;
}

export interface CourseGradebookLesson {
    id: number;
    topic: string;
    date: string;
    homework?: GradebookHomework | null;
    quizzes: GradebookQuiz[];
}

export interface CourseGradebookRow {
    student_id: number;
    full_name: string;
    student_id_number?: string | null;
    /** Kalit — uy vazifasi id si; topshirilmagan ish uchun kalit yo'q. */
    homeworks: Record<string, GradebookHomeworkCell>;
    /** Kalit — test id si; ishlanmagan test uchun kalit yo'q. */
    quizzes: Record<string, GradebookQuizCell>;
}

export interface CourseGradebook {
    course_id: number;
    group_id?: number | null;
    groups: CourseGradebookGroup[];
    lessons: CourseGradebookLesson[];
    /** Darsga bog'lanmagan (kurs darajasidagi) uy vazifalari. */
    course_homeworks: GradebookHomework[];
    students: CourseGradebookRow[];
}

export const courseService = {
    getTeacherSummaries: async (search?: string, facultyId?: number, kafedraId?: number) => {
        const response = await api.get<{ teachers: CourseTeacherSummary[] }>('/course/teachers/summary', {
            params: { search, faculty_id: facultyId, kafedra_id: kafedraId },
        });
        return response.data.teachers;
    },
    getCourses: async (filters: CourseListFilters = {}) => {
        const { page = 1, limit = 10 } = filters;
        const params: Record<string, unknown> = { page, limit };
        if (filters.teacherId) params.teacher_id = filters.teacherId;
        if (filters.subjectId) params.subject_id = filters.subjectId;
        if (filters.groupId) params.group_id = filters.groupId;
        if (filters.courseType) params.course_type = filters.courseType;
        if (filters.semesterNumber) params.semester_number = filters.semesterNumber;
        if (filters.facultyId) params.faculty_id = filters.facultyId;
        if (filters.kafedraId) params.kafedra_id = filters.kafedraId;
        if (filters.specialityId) params.speciality_id = filters.specialityId;
        // Yuborilmasa server faqat faol kurslarni qaytaradi.
        if (filters.isActive === false) params.is_active = false;
        // Qidiruv va saralash ham serverda: ilgari ular ochilgan sahifaning
        // ichida ishlar, ikkinchi sahifadagi kurs esa «topilmadi» bo'lardi.
        if (filters.search?.trim()) params.search = filters.search.trim();
        if (filters.sortBy) {
            params.sort_by = filters.sortBy;
            params.order = filters.order ?? 'asc';
        }

        const response = await api.get<CourseListResponse>('/course/', { params });
        return response.data;
    },

    getMyGrades: async (id: number) => {
        const response = await api.get<MyCourseGrades>(`/course/${id}/my-grades`);
        return response.data;
    },
    getGradebook: async (id: number, groupId?: number) => {
        const response = await api.get<CourseGradebook>(`/course/${id}/gradebook`, {
            params: groupId ? { group_id: groupId } : undefined,
        });
        return response.data;
    },
    getCourseById: async (id: number): Promise<Course> => {
        const response = await api.get<Course>(`/course/${id}`);
        return response.data;
    },

    createCourse: async (data: CourseCreateRequest) => {
        const response = await api.post<Course>('/course/', data);
        return response.data;
    },

    updateCourse: async (id: number, data: CourseUpdateRequest) => {
        const response = await api.put<Course>(`/course/${id}`, data);
        return response.data;
    },

    deleteCourse: async (id: number) => {
        await api.delete(`/course/${id}`);
    },
};
