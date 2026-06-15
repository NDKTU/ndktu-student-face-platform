import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    academicYearService,
    type AcademicYearCreateRequest,
    type AcademicYearUpdateRequest,
    type SemesterUpdateRequest,
} from '@/services/academicYearService';

export const useAcademicYears = (
    params?: { is_active?: boolean; page?: number; limit?: number },
    enabled: boolean = true,
) =>
    useQuery({
        queryKey: ['academic-years', params],
        queryFn: () => academicYearService.list(params),
        placeholderData: (previousData) => previousData,
        enabled,
    });

export const useAcademicYear = (id: number | undefined) =>
    useQuery({
        queryKey: ['academic-year', id],
        queryFn: () => academicYearService.getById(id!),
        enabled: !!id,
    });

export const useCreateAcademicYear = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: AcademicYearCreateRequest) => academicYearService.create(data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['academic-years'] }),
    });
};

export const useUpdateAcademicYear = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: AcademicYearUpdateRequest }) =>
            academicYearService.update(id, data),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['academic-years'] });
            qc.invalidateQueries({ queryKey: ['academic-year', data.id] });
        },
    });
};

export const useDeleteAcademicYear = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => academicYearService.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['academic-years'] }),
    });
};

export const useUpdateSemester = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: SemesterUpdateRequest }) =>
            academicYearService.updateSemester(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['academic-years'] });
            // Might need to invalidate specific academic year as well if we had its ID,
            // but invalidating all list is fine.
        },
    });
};
