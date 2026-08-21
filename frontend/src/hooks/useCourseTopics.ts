import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { courseTopicService, type CourseTopicCreateRequest } from '@/services/courseTopicService';

export const useCourseTopics = (courseId?: number, enabled = true) => useQuery({
    queryKey: ['course-topics', courseId],
    queryFn: () => courseTopicService.list(courseId!),
    enabled: Boolean(courseId && enabled),
});

export const useCreateCourseTopic = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CourseTopicCreateRequest) => courseTopicService.create(data),
        onSuccess: (topic) => {
            queryClient.invalidateQueries({ queryKey: ['course-topics', topic.course_id] });
            queryClient.invalidateQueries({ queryKey: ['course', topic.course_id] });
            queryClient.invalidateQueries({ queryKey: ['courses'] });
        },
    });
};

export const useUpdateCourseTopic = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: { title?: string; order_index?: number } }) =>
            courseTopicService.update(id, data),
        onSuccess: (topic) => {
            queryClient.invalidateQueries({ queryKey: ['course-topics', topic.course_id] });
        },
    });
};

export const useDeleteCourseTopic = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => courseTopicService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['course-topics'] });
            queryClient.invalidateQueries({ queryKey: ['lessons'] });
            queryClient.invalidateQueries({ queryKey: ['courses'] });
        },
    });
};
