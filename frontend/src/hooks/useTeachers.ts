import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teacherService, type TeacherCreateRequest, type TeacherUpdateRequest } from '@/services/teacherService';

export const useTeachers = (page = 1, limit = 10, full_name?: string, enabled: boolean = true, kafedra_id?: number) => {
    return useQuery({
        queryKey: ['teachers', page, limit, full_name, kafedra_id],
        queryFn: () => teacherService.getTeachers(page, limit, full_name, kafedra_id),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useTeacher = (id: number) => {
    return useQuery({
        queryKey: ['teacher', id],
        queryFn: () => teacherService.getTeacherById(id),
        enabled: !!id,
    });
};

export const useCreateTeacher = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: TeacherCreateRequest) => teacherService.createTeacher(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
        },
    });
};

export const useUpdateTeacher = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: TeacherUpdateRequest }) =>
            teacherService.updateTeacher(id, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
            queryClient.invalidateQueries({ queryKey: ['teacher', data.id] });
        },
    });
};

export const useDeleteTeacher = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, force }: { id: number; force?: boolean }) => teacherService.deleteTeacher(id, force),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
        },
    });
}

export const useAssignGroups = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ user_id, group_ids }: { user_id: number; group_ids: number[] }) =>
            teacherService.assignGroups(user_id, group_ids),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
        },
    });
};

export const useAssignSubjects = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ teacher_id, subject_ids }: { teacher_id: number; subject_ids: number[] }) =>
            teacherService.assignSubjects(teacher_id, subject_ids),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] });
        },
    });
};

export const useTeacherAssignedGroups = (userId?: number) => {
    return useQuery({
        queryKey: ['teacherAssignedGroups', userId],
        queryFn: () => teacherService.getAssignedGroups(userId!),
        enabled: !!userId,
    });
};

// ── Ranking hooks ─────────────────────────────────────────────────────────

type TeacherRankingFilters = {
    faculty_id?: number;
    kafedra_id?: number;
    group_id?: number;
    search?: string;
};

export const useTeacherRanking = (filters?: TeacherRankingFilters & { page?: number; limit?: number }) => {
    return useQuery({
        queryKey: ['teacherRanking', filters ?? {}],
        queryFn: () => teacherService.getRankingOverall(filters),
        placeholderData: (prev) => prev,
    });
};

export const useFacultyRanking = (params?: { page?: number; limit?: number }) => {
    return useQuery({
        queryKey: ['facultyRanking', params ?? {}],
        queryFn: () => teacherService.getFacultyRanking(params),
        placeholderData: (prev) => prev,
    });
};

export const useKafedraRanking = (params?: { page?: number; limit?: number }) => {
    return useQuery({
        queryKey: ['kafedraRanking', params ?? {}],
        queryFn: () => teacherService.getKafedraRanking(params),
        placeholderData: (prev) => prev,
    });
};
