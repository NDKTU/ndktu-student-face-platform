import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    assignmentService,
    type AssignmentCreateRequest,
    type AssignmentUpdateRequest,
    type SubmissionGradeRequest,
    type SubmissionSubmitRequest,
} from '@/services/assignmentService';

export const useAssignments = (params?: {
    sinf_id?: number;
    topic_id?: number;
    lesson_id?: number;
    page?: number;
    limit?: number;
}) =>
    useQuery({
        queryKey: ['assignments', params],
        queryFn: () => assignmentService.list(params),
        placeholderData: (previousData) => previousData,
    });

export const useAssignment = (id: number | undefined) =>
    useQuery({
        queryKey: ['assignment', id],
        queryFn: () => assignmentService.getById(id!),
        enabled: !!id,
    });

export const useCreateAssignment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: AssignmentCreateRequest) => assignmentService.create(data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
    });
};

export const useUpdateAssignment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: AssignmentUpdateRequest }) =>
            assignmentService.update(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
    });
};

export const useDeleteAssignment = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => assignmentService.delete(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments'] }),
    });
};

export const useSubmissions = (assignmentId: number | undefined) =>
    useQuery({
        queryKey: ['submissions', assignmentId],
        queryFn: () => assignmentService.listSubmissions(assignmentId!),
        enabled: !!assignmentId,
    });

export const useMySubmission = (assignmentId: number | undefined) =>
    useQuery({
        queryKey: ['my-submission', assignmentId],
        queryFn: () => assignmentService.getMySubmission(assignmentId!),
        enabled: !!assignmentId,
    });

export const useSubmitAssignment = (assignmentId: number | undefined) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: SubmissionSubmitRequest) => assignmentService.submit(assignmentId!, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] });
            qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
            qc.invalidateQueries({ queryKey: ['assignments'] });
        },
    });
};

export const useGradeSubmission = (assignmentId: number | undefined) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ userId, data }: { userId: number; data: SubmissionGradeRequest }) =>
            assignmentService.grade(assignmentId!, userId, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['submissions', assignmentId] });
            qc.invalidateQueries({ queryKey: ['assignments'] });
        },
    });
};
