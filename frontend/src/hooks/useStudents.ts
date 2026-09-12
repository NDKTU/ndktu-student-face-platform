import { useQuery, /* useMutation, */ /* useQueryClient */ } from '@tanstack/react-query';
import { studentService, type StudentListParams /* , type StudentCreateRequest */ } from '@/services/studentService';

export const useStudents = (
    page = 1,
    limit = 10,
    full_name?: string,
    user_id?: number,
    group_id?: number,
    enabled: boolean = true,
    params?: StudentListParams,
) => {
    return useQuery({
        queryKey: ['students', page, limit, full_name, user_id, group_id, params],
        queryFn: () => studentService.getStudents(page, limit, full_name, user_id, group_id, params),
        placeholderData: (previousData) => previousData,
        enabled,
    });
};

export const useStudent = (id: number) => {
    return useQuery({
        queryKey: ['student', id],
        queryFn: () => studentService.getStudentById(id),
        enabled: !!id,
    });
};

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useCreateStudent = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: (data: StudentCreateRequest) => studentService.createStudent(data),
//         onSuccess: () => {
//             queryClient.invalidateQueries({ queryKey: ['students'] });
//         },
//     });
// };

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useUpdateStudent = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: ({ id, data }: { id: number; data: Partial<StudentCreateRequest> }) =>
//             studentService.updateStudent(id, data),
//         onSuccess: (data) => {
//             queryClient.invalidateQueries({ queryKey: ['students'] });
//             queryClient.invalidateQueries({ queryKey: ['student', data.id] });
//         },
//     });
// };

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useUpdateStudentGroup = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: ({ id, groupId }: { id: number; groupId: number }) =>
//             studentService.updateStudentGroup(id, groupId),
//         onSuccess: (data) => {
//             queryClient.invalidateQueries({ queryKey: ['students'] });
//             queryClient.invalidateQueries({ queryKey: ['student', data.id] });
//         },
//     });
// };

// EPOS/HEMIS maʼlumoti: yaratish/tahrirlash/oʻchirish 2026-09-11 da kommentga
// olindi — backendda ham bu endpointlar kommentda. Qaytarish uchun kommentni
// olib tashlash kifoya.
// export const useDeleteStudent = () => {
//     const queryClient = useQueryClient();
//     return useMutation({
//         mutationFn: ({ id, force }: { id: number; force?: boolean }) => studentService.deleteStudent(id, force),
//         onSuccess: () => {
//             queryClient.invalidateQueries({ queryKey: ['students'] });
//         },
//     });
// };
