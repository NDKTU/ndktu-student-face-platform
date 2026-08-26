import { z } from 'zod';

// O'qituvchi endi xodim kartochkasining o'zi: yaratishda hisob ma'lumotlari
// va F.I.SH so'raladi, `employee_id` bilan bog'lash bekor qilingan.
export const teacherCreateSchema = z.object({
    username: z.string().min(3, 'Login kamida 3 ta belgidan iborat bo\'lsin'),
    password: z.string().min(6, 'Parol kamida 6 ta belgidan iborat bo\'lsin'),
    first_name: z.string().min(1, 'Ism kiritilishi shart'),
    last_name: z.string().min(1, 'Familiya kiritilishi shart'),
    third_name: z.string().min(1, 'Otasining ismi kiritilishi shart'),
    kafedra_id: z.number().nullable().optional(),
});

export const teacherUpdateSchema = z.object({
    first_name: z.string().min(1, 'Ism kiritilishi shart'),
    last_name: z.string().min(1, 'Familiya kiritilishi shart'),
    third_name: z.string().min(1, 'Otasining ismi kiritilishi shart'),
    kafedra_id: z.number().nullable().optional(),
});

export type TeacherCreateFormValues = z.infer<typeof teacherCreateSchema>;
export type TeacherUpdateFormValues = z.infer<typeof teacherUpdateSchema>;
