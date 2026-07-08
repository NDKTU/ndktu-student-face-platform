import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { facultyService } from '@/services/facultyService';
import { kafedraService } from '@/services/kafedraService';
import { roleService } from '@/services/roleService';
import { permissionService } from '@/services/permissionService';
import { specialityService } from '@/services/specialityService';

// Faculties
export const useFaculties = (page = 1, limit = 100, name?: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['faculties', page, limit, name],
        queryFn: () => facultyService.getFaculties(page, limit, name),
        enabled,
    });
};

export const useCreateFaculty = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { name: string }) => facultyService.createFaculty(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['faculties'] });
        },
    });
};

export const useUpdateFaculty = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: { name: string } }) => facultyService.updateFaculty(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['faculties'] });
        },
    });
};

export const useDeleteFaculty = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, force }: { id: number; force?: boolean }) => facultyService.deleteFaculty(id, force),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['faculties'] });
        },
    });
};

// Kafedras
export const useKafedras = (
    page = 1,
    limit = 100,
    name?: string,
    faculty_id?: number,
    enabled: boolean = true,
) => {
    return useQuery({
        queryKey: ['kafedras', page, limit, name, faculty_id],
        queryFn: () => kafedraService.getKafedras(page, limit, name, faculty_id),
        enabled,
    });
};

export const useCreateKafedra = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { name: string; faculty_id: number }) => kafedraService.createKafedra(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['kafedras'] });
        },
    });
};

export const useUpdateKafedra = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: { name: string; faculty_id: number } }) => kafedraService.updateKafedra(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['kafedras'] });
        },
    });
};

export const useDeleteKafedra = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, force }: { id: number; force?: boolean }) => kafedraService.deleteKafedra(id, force),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['kafedras'] });
        },
    });
};

// Specialities
export const useSpecialities = (page = 1, limit = 100, name?: string, kafedra_id?: number, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['specialities', page, limit, name, kafedra_id],
        queryFn: () => specialityService.getSpecialities(page, limit, name, kafedra_id),
        enabled,
    });
};

// Roles
export const useRoles = (page = 1, limit = 100, name?: string) => {
    return useQuery({
        queryKey: ['roles', page, limit, name],
        queryFn: () => roleService.getRoles(page, limit, name),
    });
};

// Permissions
export const usePermissions = (page = 1, limit = 100, name?: string) => {
    return useQuery({
        queryKey: ['permissions', page, limit, name],
        queryFn: () => permissionService.getPermissions(page, limit, name),
    });
};

export const useAssignPermissions = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ role_id, permission_ids }: { role_id: number; permission_ids: number[] }) =>
            roleService.assignPermissions(role_id, permission_ids),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
        },
    });
};
