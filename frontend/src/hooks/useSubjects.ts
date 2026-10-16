import { useMemo, useState } from 'react';
import { useQuery, /* useMutation, */ /* useQueryClient */ } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { subjectService, type SubjectListParams } from '@/services/subjectService';
import { FILTER_PAGE_SIZE, withSelected, type FilterOption } from '@/utils/filterOptions';
import { subjectOption } from '@/utils/subject';

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

/**
 * Fan tanlash ro'yxati (filtr yoki forma): qidiruv serverda.
 *
 * Fanlar 3254 ta. Ilgari sahifalar `useSubjects(1, 1000)` (yoki 500) bilan
 * birinchi minglikni yuklab, nom va tanlovni shu ro'yxatdan qidirardi —
 * qolgan fanlar filtrda yo'q, jadvalda esa nomsiz edi. Endi ro'yxatda faqat
 * qidiruv natijasi (`FILTER_PAGE_SIZE`), tanlangan fan esa qidiruvga tushmasa
 * ham id bo'yicha alohida olinadi — sahifa yangilanganda ham yorlig'i to'g'ri.
 *
 * `fallbackLabel` — tanlangan fanning nomi javobning o'zida kelgan bo'lsa
 * (masalan, `quiz.subject_name`), qo'shimcha so'rov kutilmaydi.
 */
export const useSubjectFilter = (
    selectedId?: number | null,
    enabled: boolean = true,
    fallbackLabel?: string | null,
) => {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query);
    const { data: listData, isFetching } = useSubjects(1, FILTER_PAGE_SIZE, debouncedQuery, undefined, enabled);
    const list = listData?.subjects;
    const inList = !!selectedId && !!list?.some((subject) => subject.id === selectedId);
    const { data: selectedSubject } = useSubject(enabled && selectedId && !inList && !fallbackLabel ? selectedId : 0);

    const options = useMemo<FilterOption[]>(() => {
        const base = (list ?? []).map(subjectOption);
        if (!selectedId) return base;
        const label = selectedSubject?.name ?? fallbackLabel ?? `#${selectedId}`;
        return withSelected(base, { value: String(selectedId), label });
    }, [list, selectedId, selectedSubject, fallbackLabel]);

    return { options, onSearch: setQuery, isFetching };
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
