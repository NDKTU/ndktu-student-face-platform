import { useQuery, /* useMutation, */ /* useQueryClient */ } from '@tanstack/react-query';
import { groupService, type GroupListParams } from '@/services/groupService';
import { useMemo, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FILTER_PAGE_SIZE, withSelected, type FilterOption } from '@/utils/filterOptions';

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

/**
 * Guruh tanlash ro'yxati (filtr yoki forma): qidiruv serverda.
 *
 * Ilgari sahifalar `useGroups(1, 1000)` bilan hamma guruhni yuklab, nom va
 * tanlovni shu ro'yxatdan qidirardi. 693 ta guruh hozircha sig'ardi, lekin
 * 1001-guruhdan boshlab filtrlar jimgina ma'lumot yo'qotardi (fanlarda
 * aynan shunday bo'lgan: 3254 tadan 1000 tasi). Tanlangan guruh qidiruvga
 * tushmasa ham id bo'yicha olinadi — yorlig'i to'g'ri qoladi.
 */
export const useGroupFilter = (
    selectedId?: number | null,
    enabled: boolean = true,
    fallbackLabel?: string | null,
) => {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query);
    const { data: listData, isFetching } = useGroups(1, FILTER_PAGE_SIZE, debouncedQuery, undefined, undefined, enabled);
    const list = listData?.groups;
    const inList = !!selectedId && !!list?.some((group) => group.id === selectedId);
    const { data: selectedGroup } = useGroup(enabled && selectedId && !inList && !fallbackLabel ? selectedId : 0);

    const options = useMemo<FilterOption[]>(() => {
        const base = (list ?? []).map((group) => ({ value: String(group.id), label: group.name }));
        if (!selectedId) return base;
        const label = selectedGroup?.name ?? fallbackLabel ?? `#${selectedId}`;
        return withSelected(base, { value: String(selectedId), label });
    }, [list, selectedId, selectedGroup, fallbackLabel]);

    return { options, onSearch: setQuery, isFetching };
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
