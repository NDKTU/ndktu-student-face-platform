import { z } from 'zod';

export const employeeCreateSchema = z.object({
    first_name: z.string().min(1, 'Ism kiritilishi shart'),
    last_name: z.string().min(1, 'Familiya kiritilishi shart'),
    third_name: z.string().min(1, 'Otasining ismi kiritilishi shart'),
    phone_number: z.string().optional(),
    image_url: z.string().nullable().optional(),
    username: z.string().min(3, 'Minimum 3 ta belgi'),
    password: z.string().min(4, 'Minimum 4 ta belgi'),
    role_ids: z.array(z.number()).min(1, 'Kamida bitta rol tanlanishi shart'),
});

export const employeeUpdateSchema = z.object({
    first_name: z.string().min(1, 'Ism kiritilishi shart'),
    last_name: z.string().min(1, 'Familiya kiritilishi shart'),
    third_name: z.string().min(1, 'Otasining ismi kiritilishi shart'),
    phone_number: z.string().optional(),
    image_url: z.string().nullable().optional(),
});

export type EmployeeCreateFormValues = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateFormValues = z.infer<typeof employeeUpdateSchema>;
