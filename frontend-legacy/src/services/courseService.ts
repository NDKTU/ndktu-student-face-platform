import api from './api';

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
    semester_number?: number | null;
    faculty_id?: number | null;
    kafedra_id?: number | null;
    speciality_id?: number | null;
    subject?: CourseSubjectInfo;
    teacher?: CourseTeacherInfo;
    faculty?: CourseFacultyInfo;
    kafedra?: CourseKafedraInfo;
    speciality?: CourseSpecialityInfo;
    groups: CourseGroupInfo[];
    created_at: string;
    updated_at: string;
}

export interface CourseCreateRequest {
    name: string;
    subject_id: number;
    teacher_id: number;
    description?: string;
    semester_number?: number;
    group_ids?: number[];
    faculty_id?: number;
    kafedra_id?: number;
    speciality_id?: number;
}

export type CourseUpdateRequest = Partial<CourseCreateRequest>;

export interface CourseListResponse {
    total: number;
    page: number;
    limit: number;
    courses: Course[];
}

export const courseService = {
    getCourses: async (
        page = 1,
        limit = 10,
        teacherId?: number,
        subjectId?: number,
        groupId?: number,
        semesterNumber?: number,
        facultyId?: number,
        kafedraId?: number,
        specialityId?: number,
    ) => {
        const params: any = { page, limit };
        if (teacherId) params.teacher_id = teacherId;
        if (subjectId) params.subject_id = subjectId;
        if (groupId) params.group_id = groupId;
        if (semesterNumber) params.semester_number = semesterNumber;
        if (facultyId) params.faculty_id = facultyId;
        if (kafedraId) params.kafedra_id = kafedraId;
        if (specialityId) params.speciality_id = specialityId;

        const response = await api.get<CourseListResponse>('/course/', { params });
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
