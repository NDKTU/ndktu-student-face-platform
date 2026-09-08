import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceService, type AttendanceMarkItem } from '@/services/attendanceService';

export const useLessonAttendance = (lessonId?: number, groupId?: number) => {
    return useQuery({
        queryKey: ['lesson-attendance', lessonId, groupId ?? null],
        queryFn: () => attendanceService.get(lessonId!, groupId),
        enabled: !!lessonId,
        placeholderData: (previousData) => previousData,
    });
};

export const useSaveLessonAttendance = (lessonId?: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ items, groupId }: { items: AttendanceMarkItem[]; groupId?: number }) =>
            attendanceService.save(lessonId!, items, groupId),
        onSuccess: (data) => {
            // Javobda yangilangan jurnal keladi — uni darhol keshga qo'yamiz,
            // aks holda saqlagandan keyin ro'yxat bir zumda eski holatga
            // qaytib ko'rinardi.
            queryClient.setQueryData(['lesson-attendance', lessonId, data.group_id ?? null], data);
            queryClient.invalidateQueries({ queryKey: ['lesson-attendance', lessonId] });
        },
    });
};

export const useCourseAttendance = (courseId?: number, groupId?: number, enabled = true) => {
    return useQuery({
        queryKey: ['course-attendance', courseId, groupId ?? null],
        queryFn: () => attendanceService.getCourse(courseId!, groupId),
        enabled: !!courseId && enabled,
        placeholderData: (previousData) => previousData,
    });
};

/** Ro'yxatdagi talabalar uchun davomat foizi. Sahifadagi id'lar bo'yicha
 *  so'raladi — butun universitetni hisoblashning hojati yo'q. */
export const useAttendanceStats = (
    studentIds: number[],
    opts?: { courseId?: number; teacherUserId?: number; enabled?: boolean },
) => {
    const key = studentIds.join(',');
    return useQuery({
        queryKey: ['attendance-stats', key, opts?.courseId ?? null, opts?.teacherUserId ?? null],
        queryFn: () => attendanceService.getStats(studentIds, opts),
        enabled: (opts?.enabled ?? true) && studentIds.length > 0,
        placeholderData: (previousData) => previousData,
    });
};

export const useMyAttendance = (enabled = true) => {
    return useQuery({
        queryKey: ['my-attendance'],
        queryFn: () => attendanceService.getMine(),
        enabled,
    });
};
