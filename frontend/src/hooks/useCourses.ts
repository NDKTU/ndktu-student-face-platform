import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    courseService,
    type CourseCreateRequest,
    type CourseListFilters,
    type CourseUpdateRequest,
} from '@/services/courseService';

export const useCourses = (filters: CourseListFilters = {}, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['courses', filters],
        queryFn: () => courseService.getCourses(filters),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useCourseTeacherSummaries = (
    search?: string,
    facultyId?: number,
    kafedraId?: number,
    enabled = true,
) => useQuery({
    queryKey: ['course-teacher-summaries', search, facultyId, kafedraId],
    queryFn: () => courseService.getTeacherSummaries(search, facultyId, kafedraId),
    enabled,
});

export const useCourse = (id?: number) => {
    return useQuery({
        queryKey: ['course', id],
        queryFn: () => courseService.getCourseById(id!),
        enabled: !!id,
    });
};

export const useCreateCourse = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CourseCreateRequest) => courseService.createCourse(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['courses'] });
            queryClient.invalidateQueries({ queryKey: ['course-teacher-summaries'] });
        },
    });
};

export const useUpdateCourse = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: CourseUpdateRequest }) => courseService.updateCourse(id, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['courses'] });
            queryClient.invalidateQueries({ queryKey: ['course-teacher-summaries'] });
            queryClient.invalidateQueries({ queryKey: ['course', data.id] });
        },
    });
};

export const useDeleteCourse = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => courseService.deleteCourse(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['courses'] });
            queryClient.invalidateQueries({ queryKey: ['course-teacher-summaries'] });
        },
    });
};
