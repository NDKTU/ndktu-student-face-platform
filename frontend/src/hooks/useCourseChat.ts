import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { courseChatService } from '@/services/courseChatService';

/**
 * Chat real vaqtga yaqin bo'lishi uchun oxirgi xabarlar har 5 soniyada
 * qayta so'raladi. WebSocket o'rniga so'rov: kurs chati tezkor messenjer
 * emas, bu esa qo'shimcha infratuzilmasiz ishlaydi. Tab yashirin bo'lsa
 * (`refetchIntervalInBackground` o'chiq) so'rov to'xtaydi.
 */
const POLL_INTERVAL_MS = 5000;

export const courseMessagesKey = (courseId: number) => ['course-messages', courseId] as const;

export const useCourseMessages = (courseId: number, enabled = true) =>
    useQuery({
        queryKey: courseMessagesKey(courseId),
        queryFn: () => courseChatService.list(courseId),
        enabled,
        refetchInterval: POLL_INTERVAL_MS,
    });

export const useSendCourseMessage = (courseId: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: string) => courseChatService.send(courseId, body),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: courseMessagesKey(courseId) }),
    });
};

export const useDeleteCourseMessage = (courseId: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (messageId: number) => courseChatService.remove(courseId, messageId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: courseMessagesKey(courseId) }),
    });
};
