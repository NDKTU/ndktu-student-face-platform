import api from './api';

export interface EmployeeUserInfo {
    id: number;
    username: string;
    roles: { id: number; name: string }[];
}

export interface EmployeeTeacherInfo {
    id: number;
    kafedra_id: number;
}

export interface Employee {
    id: number;
    user_id: number;
    first_name: string;
    last_name: string;
    third_name: string;
    full_name: string;
    phone_number: string | null;
    image_url: string | null;
    user?: EmployeeUserInfo;
    teacher?: EmployeeTeacherInfo | null;
    created_at: string;
    updated_at: string;
}

export interface EmployeeCreateRequest {
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    third_name: string;
    phone_number?: string;
    image_url?: string;
    roles: { name: string }[];
}

export interface EmployeeUpdateRequest {
    first_name: string;
    last_name: string;
    third_name: string;
    phone_number?: string;
    image_url?: string;
}

export interface EmployeeListResponse {
    total: number;
    page: number;
    limit: number;
    employees: Employee[];
}

export const employeeService = {
    getEmployees: async (page = 1, limit = 10, full_name?: string) => {
        const response = await api.get<EmployeeListResponse>('/employee/', {
            params: { page, limit, full_name },
        });
        return response.data;
    },

    getEmployeeById: async (id: number): Promise<Employee> => {
        const response = await api.get<Employee>(`/employee/${id}`);
        return response.data;
    },

    createEmployee: async (data: EmployeeCreateRequest) => {
        const response = await api.post<Employee>('/employee/', data);
        return response.data;
    },

    updateEmployee: async (id: number, data: EmployeeUpdateRequest) => {
        const response = await api.put<Employee>(`/employee/${id}`, data);
        return response.data;
    },

    deleteEmployee: async (id: number, force?: boolean) => {
        const url = force ? `/employee/${id}?force=true` : `/employee/${id}`;
        await api.delete(url);
    },
};
