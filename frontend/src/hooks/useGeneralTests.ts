import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    generalTestService,
    type GeneralTestPayload,
    type GroupOptionFilter,
    type QuestionPayload,
    type ResultFilter,
    type SubjectPayload,
    type UserFilter,
} from '@/services/generalTestService';

const KEYS = {
    list: ['general-tests'] as const,
    detail: (id: number) => ['general-test', id] as const,
    results: ['general-test-results'] as const,
    available: ['general-tests-available'] as const,
    mine: ['general-test-my-results'] as const,
    subjects: ['general-test-subjects'] as const,
    subject: (id: number) => ['general-test-subject', id] as const,
    subjectUsers: (id: number) => ['general-test-subject-users', id] as const,
    subjectQuestions: (id: number) => ['general-test-subject-questions', id] as const,
    candidates: (id: number) => ['general-test-subject-candidates', id] as const,
};

export const useGeneralTests = (page = 1, limit = 20, search = '', subjectId?: number, enabled = true) =>
    useQuery({
        queryKey: [...KEYS.list, page, limit, search, subjectId ?? null],
        queryFn: () => generalTestService.list(page, limit, search, subjectId),
        enabled,
        placeholderData: (prev) => prev,
    });

// ── Fanlar ──────────────────────────────────────────────────────────────────

export const useGeneralTestSubjects = (page = 1, limit = 20, search = '') =>
    useQuery({
        queryKey: [...KEYS.subjects, page, limit, search],
        queryFn: () => generalTestService.subjects(page, limit, search),
        placeholderData: (prev) => prev,
    });

export const useGeneralTestSubject = (id: number | null) =>
    useQuery({
        queryKey: KEYS.subject(id ?? 0),
        queryFn: () => generalTestService.subject(id!),
        enabled: id !== null,
    });

/** Fan yoki unga biriktirilganlar o'zgarganda — ro'yxat, kartochka, nomzodlar. */
const useInvalidateSubjects = () => {
    const qc = useQueryClient();
    return (id?: number) => {
        qc.invalidateQueries({ queryKey: KEYS.subjects });
        if (id !== undefined) {
            qc.invalidateQueries({ queryKey: KEYS.subject(id) });
            qc.invalidateQueries({ queryKey: KEYS.subjectUsers(id) });
            qc.invalidateQueries({ queryKey: KEYS.candidates(id) });
        }
    };
};

export const useSaveGeneralTestSubject = () => {
    const invalidate = useInvalidateSubjects();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: SubjectPayload }) =>
            id ? generalTestService.updateSubject(id, data) : generalTestService.createSubject(data),
        onSuccess: (saved) => {
            invalidate(saved.id);
            // Testlar ro'yxatida fan nomi ko'rinadi.
            qc.invalidateQueries({ queryKey: KEYS.list });
        },
    });
};

export const useDeleteGeneralTestSubject = () => {
    const invalidate = useInvalidateSubjects();
    return useMutation({
        mutationFn: (id: number) => generalTestService.removeSubject(id),
        onSuccess: () => invalidate(),
    });
};

export const useSubjectUsers = (id: number, filter: UserFilter & { page: number; limit: number }, enabled = true) =>
    useQuery({
        queryKey: [...KEYS.subjectUsers(id), filter],
        queryFn: () => generalTestService.subjectUsers(id, filter),
        enabled,
        placeholderData: (prev) => prev,
    });

export const useSubjectCandidates = (id: number, filter: UserFilter & { page: number; limit: number }) =>
    useQuery({
        queryKey: [...KEYS.candidates(id), filter],
        queryFn: () => generalTestService.subjectCandidates(id, filter),
        placeholderData: (prev) => prev,
    });

export const useAddSubjectUsers = (id: number) => {
    const invalidate = useInvalidateSubjects();
    return useMutation({
        mutationFn: (body: { user_ids?: number[]; filter?: UserFilter }) => generalTestService.addSubjectUsers(id, body),
        onSuccess: () => invalidate(id),
    });
};

export const useRemoveSubjectUser = (id: number) => {
    const invalidate = useInvalidateSubjects();
    return useMutation({
        mutationFn: (userId: number) => generalTestService.removeSubjectUser(id, userId),
        onSuccess: () => invalidate(id),
    });
};

export const useSubjectFilterOptions = () =>
    useQuery({
        queryKey: ['general-test-filter-options'],
        queryFn: generalTestService.filterOptions,
        staleTime: 5 * 60 * 1000,
    });

// ── Guruhlar ────────────────────────────────────────────────────────────────

export const useGroupOptions = (filter: GroupOptionFilter) =>
    useQuery({
        queryKey: ['general-test-group-options', filter],
        queryFn: () => generalTestService.groupOptions(filter),
        placeholderData: (prev) => prev,
    });

export const useGeneralTest = (id: number | null) =>
    useQuery({
        queryKey: KEYS.detail(id ?? 0),
        queryFn: () => generalTestService.get(id!),
        enabled: id !== null,
    });

/** Test yoki uning savollari o'zgarganda — ro'yxat va kartochka yangilanadi. */
const useInvalidateTests = () => {
    const qc = useQueryClient();
    return (id?: number) => {
        qc.invalidateQueries({ queryKey: KEYS.list });
        if (id !== undefined) qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    };
};

export const useCreateGeneralTest = () => {
    const invalidate = useInvalidateTests();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: GeneralTestPayload) => generalTestService.create(data),
        onSuccess: () => {
            invalidate();
            qc.invalidateQueries({ queryKey: KEYS.subjects });
        },
    });
};

export const useUpdateGeneralTest = () => {
    const invalidate = useInvalidateTests();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<GeneralTestPayload> }) =>
            generalTestService.update(id, data),
        onSuccess: (_d, vars) => {
            invalidate(vars.id);
            // Test boshqa fanga o'tkazilgan bo'lishi mumkin.
            if (vars.data.subject_id !== undefined) qc.invalidateQueries({ queryKey: KEYS.subjects });
        },
    });
};

export const useDeleteGeneralTest = () => {
    const invalidate = useInvalidateTests();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => generalTestService.remove(id),
        onSuccess: () => {
            invalidate();
            // Fan kartochkasidagi testlar soni.
            qc.invalidateQueries({ queryKey: KEYS.subjects });
        },
    });
};

export const useAddGeneralTestGroups = (testId: number) => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: (groupIds: number[]) => generalTestService.addGroups(testId, groupIds),
        onSuccess: () => invalidate(testId),
    });
};

export const useSetGeneralTestGroupActive = (testId: number) => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: ({ groupId, isActive }: { groupId: number; isActive: boolean }) =>
            generalTestService.setGroupActive(testId, groupId, isActive),
        onSuccess: () => invalidate(testId),
    });
};

export const useRemoveGeneralTestGroup = (testId: number) => {
    const invalidate = useInvalidateTests();
    return useMutation({
        mutationFn: (groupId: number) => generalTestService.removeGroup(testId, groupId),
        onSuccess: () => invalidate(testId),
    });
};

// ── Fan savollar banki ──────────────────────────────────────────────────────

export const useSubjectQuestions = (subjectId: number, enabled = true) =>
    useQuery({
        queryKey: KEYS.subjectQuestions(subjectId),
        queryFn: () => generalTestService.subjectQuestions(subjectId),
        enabled,
    });

/**
 * Bank o'zgarganda: savollar ro'yxati, fan kartochkasidagi son va testlardagi
 * «Savollar» (ular fan bankidan sanaladi).
 */
const useInvalidateBank = (subjectId: number) => {
    const qc = useQueryClient();
    return () => {
        qc.invalidateQueries({ queryKey: KEYS.subjectQuestions(subjectId) });
        qc.invalidateQueries({ queryKey: KEYS.subject(subjectId) });
        qc.invalidateQueries({ queryKey: KEYS.subjects });
        qc.invalidateQueries({ queryKey: KEYS.list });
        qc.invalidateQueries({ queryKey: ['general-test'] });
    };
};

export const useSaveSubjectQuestion = (subjectId: number) => {
    const invalidate = useInvalidateBank(subjectId);
    return useMutation({
        mutationFn: ({ id, data }: { id?: number; data: QuestionPayload }) =>
            id ? generalTestService.updateQuestion(id, data) : generalTestService.createQuestion(subjectId, data),
        onSuccess: invalidate,
    });
};

export const useDeleteSubjectQuestion = (subjectId: number) => {
    const invalidate = useInvalidateBank(subjectId);
    return useMutation({
        mutationFn: (id: number) => generalTestService.removeQuestion(id),
        onSuccess: invalidate,
    });
};

export const useUploadSubjectExcel = (subjectId: number) => {
    const invalidate = useInvalidateBank(subjectId);
    return useMutation({
        mutationFn: (file: File) => generalTestService.uploadExcel(subjectId, file),
        onSuccess: invalidate,
    });
};

export const useGeneralTestResults = (filter: ResultFilter) =>
    useQuery({
        queryKey: [...KEYS.results, filter],
        queryFn: () => generalTestService.results(filter),
        placeholderData: (prev) => prev,
    });

export const useDeleteGeneralTestResult = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (attemptId: number) => generalTestService.removeResult(attemptId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.results });
            qc.invalidateQueries({ queryKey: KEYS.list });
        },
    });
};

export const useAvailableGeneralTests = () =>
    useQuery({ queryKey: KEYS.available, queryFn: generalTestService.available });

export const useMyGeneralTestResults = () =>
    useQuery({ queryKey: KEYS.mine, queryFn: generalTestService.myResults });

/** Test tugaganda «ishlash» ro'yxati va shaxsiy natijalar yangilanadi. */
export const useRefreshTaking = () => {
    const qc = useQueryClient();
    // Barqaror funksiya: u `useCallback`/`useEffect` bog'liqliklariga tushadi.
    // Har renderda yangisi qaytsa, test sahifasidagi taymer har soniyada
    // qaytadan boshlanib, 29:58 da qotib qolardi.
    return useCallback(() => {
        qc.invalidateQueries({ queryKey: KEYS.available });
        qc.invalidateQueries({ queryKey: KEYS.mine });
    }, [qc]);
};
