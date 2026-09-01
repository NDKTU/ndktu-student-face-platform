import { useQuery } from '@tanstack/react-query';
import {
    teacherAssignmentService,
    type TeacherAssignmentListParams,
} from '@/services/teacherAssignmentService';

/**
 * EPOS yuklamasi roʻyxati.
 *
 * Kalit `teacher-assignments` — EduPlan sinxronizatsiyasi tugagach shu kesh
 * yangilanadi (`useInvalidateMirrored`).
 */
export const useTeacherAssignments = (params: TeacherAssignmentListParams) =>
    useQuery({
        queryKey: ['teacher-assignments', params],
        queryFn: () => teacherAssignmentService.list(params),
        placeholderData: (previous) => previous,
    });
