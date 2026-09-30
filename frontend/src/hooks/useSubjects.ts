import { useQuery, /* useMutation, */ /* useQueryClient */ } from '@tanstack/react-query';
import { subjectService, type SubjectListParams } from '@/services/subjectService';

export const useSubjects = (
    page = 1,
    limit = 10,
    search = '',
    teacher_id?: number,
    enabled: boolean = true,
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    // includeHidden = false,
    sort?: SubjectListParams,
) => {
    return useQuery({
        queryKey: ['subjects', page, limit, search, teacher_id, sort],
        queryFn: () => subjectService.getSubjects(page, limit, search, teacher_id, sort),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useTeacherAssignedSubjects = (userId?: number) => {
    return useQuery({
        queryKey: ['teacherAssignedSubjects', userId],
        queryFn: () => subjectService.getAssignedSubjects(userId!),
        enabled: !!userId,
    });
};

export const useSubject = (id: number) => {
    return useQuery({
        queryKey: ['subject', id],
        queryFn: () => subjectService.getSubjectById(id),
        enabled: !!id,
    });
};

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useCreateSubject = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: (data: { name: string }) => subjectService.createSubject(data),
//         onSuccess: () => {
//             queryClient.invalidateQueries({ queryKey: ['subjects'] });
//         },
//     });
// };

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useUpdateSubject = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: ({ id, data }: { id: number; data: { name: string } }) =>
//             subjectService.updateSubject(id, data),
//         onSuccess: (data) => {
//             queryClient.invalidateQueries({ queryKey: ['subjects'] });
//             queryClient.invalidateQueries({ queryKey: ['subject', data.id] });
//         },
//     });
// };

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useDeleteSubject = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: ({ id, force }: { id: number; force?: boolean }) => subjectService.deleteSubject(id, force),
//         onSuccess: () => {
//             queryClient.invalidateQueries({ queryKey: ['subjects'] });
//         },
//     });
// };
