import { useQuery, /* useMutation, */ /* useQueryClient */ } from '@tanstack/react-query';
import { groupService, type GroupListParams } from '@/services/groupService';

export const useGroups = (
    page: number,
    limit: number,
    search: string,
    teacherId?: number,
    facultyId?: number,
    specialityIdOrEnabled?: number | boolean,
    enabledParam: boolean = true,
    // Yashirish funksiyasi 2026-09-11 da kommentga olindi (VisibilityControls.tsx ga qarang).
    // includeHidden = false,
    // Qo'shimcha server filtrlari (kurs, ta'lim shakli) va saralash. Obyekt
    // sifatida: pozitsion argumentlar bu yerda allaqachon yetarlicha ko'p.
    params?: GroupListParams,
) => {
    const specialityId = typeof specialityIdOrEnabled === 'number' ? specialityIdOrEnabled : undefined;
    const enabled = typeof specialityIdOrEnabled === 'boolean' ? specialityIdOrEnabled : enabledParam;

    return useQuery({
        queryKey: ['groups', page, limit, search, teacherId, facultyId, specialityId, params],
        queryFn: () =>
            groupService.getGroups(page, limit, search, teacherId, facultyId, specialityId, params),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useGroupStudents = (groupId: number | undefined, search?: string) => {
    return useQuery({
        queryKey: ['group-students', groupId, search],
        queryFn: () => groupService.getGroupStudents(groupId!, 1, 200, search),
        enabled: !!groupId,
        placeholderData: (previousData) => previousData,
    });
};

export const useGroup = (id: number) => {
    return useQuery({
        queryKey: ['group', id],
        queryFn: () => groupService.getGroupById(id),
        enabled: !!id,
    });
};

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useCreateGroup = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: (data: { name: string; faculty_id: number }) => groupService.createGroup(data),
//         onSuccess: () => {
//             queryClient.invalidateQueries({ queryKey: ['groups'] });
//         },
//     });
// };

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useUpdateGroup = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: ({ id, data }: { id: number; data: { name: string; faculty_id: number } }) =>
//             groupService.updateGroup(id, data),
//         onSuccess: (data) => {
//             queryClient.invalidateQueries({ queryKey: ['groups'] });
//             queryClient.invalidateQueries({ queryKey: ['group', data.id] });
//         },
//     });
// };

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useDeleteGroup = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: ({ id, force }: { id: number; force?: boolean }) => groupService.deleteGroup(id, force),
//         onSuccess: () => {
//             queryClient.invalidateQueries({ queryKey: ['groups'] });
//         },
//     });
// };
