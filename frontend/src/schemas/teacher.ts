import { z } from 'zod';

export const teacherCreateSchema = z.object({
    employee_id: z.number().min(1, 'Xodim tanlanishi shart'),
    kafedra_id: z.number().min(1, 'Kafedra tanlanishi shart'),
});

export const teacherUpdateSchema = z.object({
    kafedra_id: z.number().min(1, 'Kafedra tanlanishi shart'),
});

export type TeacherCreateFormValues = z.infer<typeof teacherCreateSchema>;
export type TeacherUpdateFormValues = z.infer<typeof teacherUpdateSchema>;
