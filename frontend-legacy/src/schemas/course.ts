import { z } from 'zod';

export const courseSchema = z.object({
    name: z.string().min(1, 'Kurs nomi kiritilishi shart'),
    description: z.string().optional(),
    subject_id: z.string().min(1, 'Fan tanlanishi shart'),
    teacher_id: z.string().min(1, "O'qituvchi tanlanishi shart"),
    semester_number: z.string().optional(),
    faculty_id: z.string().optional(),
    kafedra_id: z.string().optional(),
    speciality_id: z.string().optional(),
    group_ids: z.array(z.number()).default([]),
});

export type CourseFormValues = z.infer<typeof courseSchema>;
