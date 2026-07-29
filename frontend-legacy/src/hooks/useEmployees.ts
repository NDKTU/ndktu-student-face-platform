import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    employeeService,
    type EmployeeCreateRequest,
    type EmployeeUpdateRequest,
} from '@/services/employeeService';

export const useEmployees = (page = 1, limit = 10, full_name?: string) => {
    return useQuery({
        queryKey: ['employees', page, limit, full_name],
        queryFn: () => employeeService.getEmployees(page, limit, full_name),
        placeholderData: (previousData) => previousData,
    });
};

export const useEmployee = (id: number) => {
    return useQuery({
        queryKey: ['employee', id],
        queryFn: () => employeeService.getEmployeeById(id),
        enabled: !!id,
    });
};

export const useCreateEmployee = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: EmployeeCreateRequest) => employeeService.createEmployee(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
        },
    });
};

export const useUpdateEmployee = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: EmployeeUpdateRequest }) =>
            employeeService.updateEmployee(id, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            queryClient.invalidateQueries({ queryKey: ['employee', data.id] });
        },
    });
};

export const useDeleteEmployee = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, force }: { id: number; force?: boolean }) => employeeService.deleteEmployee(id, force),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
        },
    });
};
