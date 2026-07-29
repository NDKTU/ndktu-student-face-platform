import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/services/userService';

export const useUsers = (page = 1, limit = 10, username?: string) => {
    return useQuery({
        queryKey: ['users', page, limit, username],
        queryFn: () => userService.getUsers(page, limit, username),
        placeholderData: (previousData) => previousData,
    });
};

export const useUser = (id: number) => {
    return useQuery({
        queryKey: ['user', id],
        queryFn: () => userService.getUserById(id),
        enabled: !!id,
    });
};

export const useCreateUser = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: any) => userService.createUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};

export const useUpdateUser = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: any }) =>
            userService.updateUser(id, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['user', data.id] });
        },
    });
};

export const useDeleteUser = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, force }: { id: number; force?: boolean }) => userService.deleteUser(id, force),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};

export const useSyncHemisUsers = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => userService.syncHemisUsers(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};

export const useAssignRoles = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ user_id, role_ids }: { user_id: number; role_ids: number[] }) =>
            userService.assignRoles(user_id, role_ids),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['user', variables.user_id] });
        },
    });
};
