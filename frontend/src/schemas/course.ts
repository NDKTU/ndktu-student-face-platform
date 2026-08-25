import { z } from 'zod';

// Kurs nomi, tavsif, fakultet, kafedra va yo'nalish formadan olib tashlandi:
// nom fan/guruh/semestrdan yig'iladi, qolganlari esa serverda fan va guruhdan
// aniqlanadi.
export const courseSchema = z.object({
    teacher_id: z.string().min(1, "O'qituvchi tanlanishi shart"),
    subject_id: z.string().min(1, 'Fan tanlanishi shart'),
    semester_number: z.string().min(1, 'Semestr tanlanishi shart'),
    group_ids: z.array(z.number()).min(1, 'Kamida bitta guruh tanlanishi shart'),
});

export type CourseFormValues = z.infer<typeof courseSchema>;
