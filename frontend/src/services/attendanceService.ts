import api from './api';

/** `excused` — sababli: foizga kirmaydi, lekin izsiz ham qolmaydi. */
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export type AttendanceSource = 'manual' | 'face_check';

export interface AttendanceGroupInfo {
    id: number;
    name: string;
    student_count: number;
    marked_count: number;
}

export interface AttendanceRow {
    student_id: number;
    full_name: string;
    student_id_number: string | null;
    group_id: number | null;
    group_name: string | null;
    /** `null` — hali belgilanmagan. Bu «kelmadi» degani emas. */
    status: AttendanceStatus | null;
    source: AttendanceSource | null;
    comment: string | null;
    marked_by_user_id: number | null;
    marked_at: string | null;
}

export interface AttendanceResponse {
    lesson_id: number;
    lesson_date: string;
    group_id: number | null;
    groups: AttendanceGroupInfo[];
    /** Dars bir nechta guruhniki — ro'yxat uchun guruh tanlash shart. */
    group_required: boolean;
    is_editable: boolean;
    locked_after: string | null;
    students: AttendanceRow[];
    present_count: number;
    late_count: number;
    absent_count: number;
    excused_count: number;
    unmarked_count: number;
}

export interface AttendanceMarkItem {
    student_id: number;
    /** `null` — belgini olib tashlash. */
    status: AttendanceStatus | null;
    comment?: string | null;
}

export interface AttendanceStats {
    student_id: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    counted: number;
    /** `null` — hali biror dars belgilanmagan. Bu 0% degani emas. */
    percent: number | null;
}

export interface CourseAttendanceLesson {
    id: number;
    topic: string;
    date: string;
    lesson_type: string | null;
}

export interface CourseAttendanceStudent {
    student_id: number;
    full_name: string;
    student_id_number: string | null;
    /** JSON'da kalitlar satr: `marks[String(lessonId)]`. */
    marks: Record<string, AttendanceStatus>;
    stats: AttendanceStats;
}

export interface CourseAttendanceResponse {
    course_id: number;
    group_id: number | null;
    groups: AttendanceGroupInfo[];
    group_required: boolean;
    lessons: CourseAttendanceLesson[];
    students: CourseAttendanceStudent[];
}

export interface MyAttendanceCourse {
    course_id: number;
    course_name: string;
    subject_name: string | null;
    present: number;
    late: number;
    absent: number;
    excused: number;
    percent: number | null;
}

export interface MyAttendanceItem {
    lesson_id: number;
    lesson_date: string;
    lesson_topic: string;
    course_id: number;
    course_name: string;
    status: AttendanceStatus;
    comment: string | null;
}

export interface MyAttendanceResponse {
    student_id: number;
    group_id: number | null;
    group_name: string | null;
    present: number;
    late: number;
    absent: number;
    excused: number;
    percent: number | null;
    courses: MyAttendanceCourse[];
    misses: MyAttendanceItem[];
}

export const attendanceService = {
    get: async (lessonId: number, groupId?: number): Promise<AttendanceResponse> => {
        const response = await api.get<AttendanceResponse>(`/lesson/${lessonId}/attendance`, {
            params: groupId ? { group_id: groupId } : undefined,
        });
        return response.data;
    },

    save: async (
        lessonId: number,
        items: AttendanceMarkItem[],
        groupId?: number,
    ): Promise<AttendanceResponse> => {
        const response = await api.put<AttendanceResponse>(`/lesson/${lessonId}/attendance`, {
            group_id: groupId ?? null,
            items,
        });
        return response.data;
    },

    /** Kurs jurnali: darslar × talabalar. */
    getCourse: async (courseId: number, groupId?: number): Promise<CourseAttendanceResponse> => {
        const response = await api.get<CourseAttendanceResponse>(`/course/${courseId}/attendance`, {
            params: groupId ? { group_id: groupId } : undefined,
        });
        return response.data;
    },

    /** Ro'yxatdagi talabalar uchun foiz. `teacherUserId` — hisobni o'sha
     *  o'qituvchining kurslari bilan cheklaydi. */
    getStats: async (
        studentIds: number[],
        opts?: { courseId?: number; teacherUserId?: number },
    ): Promise<AttendanceStats[]> => {
        if (studentIds.length === 0) return [];
        const response = await api.get<{ students: AttendanceStats[] }>('/attendance/stats', {
            params: {
                student_ids: studentIds.join(','),
                course_id: opts?.courseId,
                teacher_user_id: opts?.teacherUserId,
            },
        });
        return response.data.students;
    },

    getMine: async (): Promise<MyAttendanceResponse> => {
        const response = await api.get<MyAttendanceResponse>('/attendance/me');
        return response.data;
    },
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
    present: 'Keldi',
    late: 'Kechikdi',
    absent: 'Kelmadi',
    excused: 'Sababli',
};
