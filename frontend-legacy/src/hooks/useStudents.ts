import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentService, type StudentCreateRequest } from '@/services/studentService';

export const useStudents = (
    page = 1,
    limit = 10,
    full_name?: string,
    user_id?: number,
    group_id?: number,
    enabled: boolean = true,
) => {
    return useQuery({
        queryKey: ['students', page, limit, full_name, user_id, group_id],
        queryFn: () => studentService.getStudents(page, limit, full_name, user_id, group_id),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useStudent = (id: number) => {
    return useQuery({
        queryKey: ['student', id],
        queryFn: () => studentService.getStudentById(id),
        enabled: !!id,
    });
};

export const useCreateStudent = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: StudentCreateRequest) => studentService.createStudent(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['students'] });
        },
    });
};

export const useUpdateStudent = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<StudentCreateRequest> }) =>
            studentService.updateStudent(id, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['students'] });
            queryClient.invalidateQueries({ queryKey: ['student', data.id] });
        },
    });
};

export const useUpdateStudentGroup = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, groupId }: { id: number; groupId: number }) =>
            studentService.updateStudentGroup(id, groupId),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['students'] });
            queryClient.invalidateQueries({ queryKey: ['student', data.id] });
        },
    });
};

export const useDeleteStudent = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, force }: { id: number; force?: boolean }) => studentService.deleteStudent(id, force),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['students'] });
        },
    });
};
